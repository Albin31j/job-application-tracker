const express = require("express");
const mongoose = require("mongoose");
const Application = require("../models/Application");

const router = express.Router();

// Application statuses
const STATUSES = [
  "Applied",
  "Interview",
  "Rejected",
  "Offer",
  "Accepted",
  "Declined"
];

const FINAL_STATUSES = ["Rejected", "Accepted", "Declined"];

const ALLOWED_TRANSITIONS = {
  Applied: ["Interview", "Rejected"],
  Interview: ["Offer", "Rejected"],
  Offer: ["Accepted", "Declined"],
  Rejected: [],
  Accepted: [],
  Declined: []
};

// Counter collection for generating sequential application IDs.
const counterSchema = new mongoose.Schema({
  companyKey: {
    type: String,
    required: true,
    unique: true
  },
  sequence: {
    type: Number,
    default: 0
  }
});

const Counter =
  mongoose.models.ApplicationCounter ||
  mongoose.model("ApplicationCounter", counterSchema);

// Consistent JSON response
function sendResponse(res, statusCode, success, message, data = null) {
  return res.status(statusCode).json({
    success,
    message,
    data
  });
}

// Convert errors into consistent JSON responses
function handleError(res, error) {
  console.error(error);

  if (error.name === "ValidationError" || error.name === "CastError") {
    return sendResponse(res, 400, false, error.message);
  }

  if (error.code === 11000) {
    return sendResponse(
      res,
      409,
      false,
      "A record with this unique value already exists."
    );
  }

  return sendResponse(
    res,
    500,
    false,
    "An unexpected server error occurred."
  );
}

// Normalize company and role names for comparisons
function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

// Get the company key used for ID generation
function getCompanyKey(companyName) {
  return normalizeText(companyName);
}

// Generate an application ID on the backend.
// Example: JA-ABC-001
async function generateApplicationId(companyName) {
  const companyKey = getCompanyKey(companyName);

  const letters = String(companyName)
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 3)
    .padEnd(3, "X");

  const counter = await Counter.findOneAndUpdate(
    { companyKey },
    { $inc: { sequence: 1 } },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true
    }
  );

  return `JA-${letters}-${String(counter.sequence).padStart(3, "0")}`;
}

// Validate applied dates and reject future dates
function parseAppliedDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  const today = new Date();
  const todayString =
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  if (value > todayString) {
    return null;
  }

  return date;
}

// Calculate follow-up date: seven days after applied date
function calculateFollowUpDate(appliedDate) {
  const followUpDate = new Date(appliedDate);
  followUpDate.setUTCDate(followUpDate.getUTCDate() + 7);
  return followUpDate;
}

// Check whether a duplicate active application exists
async function findActiveDuplicate(companyName, jobRole, excludeId = null) {
  const query = {
    companyName: {
      $regex: `^${escapeRegex(normalizeText(companyName))}$`,
      $options: "i"
    },
    jobRole: {
      $regex: `^${escapeRegex(normalizeText(jobRole))}$`,
      $options: "i"
    },
    status: { $in: ["Applied", "Interview", "Offer"] }
  };

  if (excludeId) {
    query._id = { $ne: excludeId };
  }

  return Application.findOne(query);
}

// Escape text before using it in a regular expression
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Update overdue flags before returning applications
async function refreshOverdueFlags() {
  const now = new Date();

  await Application.updateMany(
    {
      status: "Applied",
      followUpDate: { $lt: now },
      isOverdue: false
    },
    { $set: { isOverdue: true } }
  );

  await Application.updateMany(
    {
      $or: [
        { status: { $ne: "Applied" } },
        { followUpDate: { $gte: now } }
      ],
      isOverdue: true
    },
    { $set: { isOverdue: false } }
  );
}

// --------------------------------------------------
// GET /api/applications
// List applications with optional status and search
// --------------------------------------------------
router.get("/", async (req, res) => {
  try {
    await refreshOverdueFlags();

    const { status, search } = req.query;
    const query = {};

    if (status) {
      if (!STATUSES.includes(status)) {
        return sendResponse(res, 400, false, "Invalid application status.");
      }

      query.status = status;
    }

    if (search && search.trim()) {
      const searchRegex = new RegExp(escapeRegex(search.trim()), "i");

      query.$or = [
        { companyName: searchRegex },
        { jobRole: searchRegex }
      ];
    }

    const applications = await Application.find(query).sort({
      createdAt: -1
    });

    return sendResponse(
      res,
      200,
      true,
      "Applications retrieved successfully.",
      applications
    );
  } catch (error) {
    return handleError(res, error);
  }
});

// --------------------------------------------------
// GET /api/applications/stats
// Count applications by status
// --------------------------------------------------
router.get("/stats", async (req, res) => {
  try {
    await refreshOverdueFlags();

    const counts = await Application.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 }
        }
      }
    ]);

    const statistics = {
      total: 0,
      Applied: 0,
      Interview: 0,
      Rejected: 0,
      Offer: 0,
      Accepted: 0,
      Declined: 0,
      overdue: 0
    };

    for (const item of counts) {
      statistics[item._id] = item.count;
      statistics.total += item.count;
    }

    statistics.overdue = await Application.countDocuments({
      status: "Applied",
      isOverdue: true
    });

    return sendResponse(
      res,
      200,
      true,
      "Application statistics retrieved successfully.",
      statistics
    );
  } catch (error) {
    return handleError(res, error);
  }
});

// --------------------------------------------------
// GET /api/applications/:id
// Get one application by MongoDB ID
// --------------------------------------------------
router.get("/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return sendResponse(res, 400, false, "Invalid application ID.");
    }

    await refreshOverdueFlags();

    const application = await Application.findById(req.params.id);

    if (!application) {
      return sendResponse(res, 404, false, "Application not found.");
    }

    return sendResponse(
      res,
      200,
      true,
      "Application retrieved successfully.",
      application
    );
  } catch (error) {
    return handleError(res, error);
  }
});

// --------------------------------------------------
// POST /api/applications
// Create a new application
// --------------------------------------------------
router.post("/", async (req, res) => {
  try {
    const {
      companyName,
      jobRole,
      jobType,
      appliedDate,
      expectedSalary,
      notes
    } = req.body;

    if (
      typeof companyName !== "string" ||
      !companyName.trim() ||
      typeof jobRole !== "string" ||
      !jobRole.trim()
    ) {
      return sendResponse(
        res,
        400,
        false,
        "Company name and job role are required."
      );
    }

    if (!["Full-time", "Internship", "Contract"].includes(jobType)) {
      return sendResponse(res, 400, false, "Invalid job type.");
    }

    const parsedDate = parseAppliedDate(appliedDate);

    if (!parsedDate) {
      return sendResponse(
        res,
        400,
        false,
        "Applied date must be a valid date and cannot be in the future."
      );
    }

    if (
      expectedSalary !== undefined &&
      expectedSalary !== null &&
      expectedSalary !== "" &&
      (!Number.isFinite(Number(expectedSalary)) ||
        Number(expectedSalary) < 0)
    ) {
      return sendResponse(
        res,
        400,
        false,
        "Expected salary must be a non-negative number."
      );
    }

    const duplicate = await findActiveDuplicate(
      companyName,
      jobRole
    );

    if (duplicate) {
      return sendResponse(
        res,
        409,
        false,
        "An active application already exists for this company and job role."
      );
    }

    // Application ID is generated by the backend, never by the client.
    const applicationId = await generateApplicationId(companyName.trim());

    const application = await Application.create({
      applicationId,
      companyName: companyName.trim(),
      jobRole: jobRole.trim(),
      jobType,
      appliedDate: parsedDate,
      expectedSalary:
        expectedSalary === undefined ||
        expectedSalary === null ||
        expectedSalary === ""
          ? null
          : Number(expectedSalary),
      notes: typeof notes === "string" ? notes.trim() : "",
      status: "Applied",
      statusHistory: [
        {
          status: "Applied",
          changedAt: new Date()
        }
      ],
      followUpDate: calculateFollowUpDate(parsedDate),
      isOverdue: calculateFollowUpDate(parsedDate) < new Date()
    });

    return sendResponse(
      res,
      201,
      true,
      "Job application created successfully.",
      application
    );
  } catch (error) {
    return handleError(res, error);
  }
});

// --------------------------------------------------
// PUT /api/applications/:id
// Edit allowed application details
// Applied date and application ID are immutable.
// --------------------------------------------------
router.put("/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return sendResponse(res, 400, false, "Invalid application ID.");
    }

    const application = await Application.findById(req.params.id);

    if (!application) {
      return sendResponse(res, 404, false, "Application not found.");
    }

    const {
      companyName,
      jobRole,
      jobType,
      expectedSalary,
      notes
    } = req.body;

    // Do not allow edits to the application ID, applied date, or status.
    const updatedCompany =
      companyName === undefined
        ? application.companyName
        : companyName;

    const updatedRole =
      jobRole === undefined
        ? application.jobRole
        : jobRole;

    if (
      typeof updatedCompany !== "string" ||
      !updatedCompany.trim() ||
      typeof updatedRole !== "string" ||
      !updatedRole.trim()
    ) {
      return sendResponse(
        res,
        400,
        false,
        "Company name and job role cannot be empty."
      );
    }

    if (
      jobType !== undefined &&
      !["Full-time", "Internship", "Contract"].includes(jobType)
    ) {
      return sendResponse(res, 400, false, "Invalid job type.");
    }

    if (
      expectedSalary !== undefined &&
      expectedSalary !== null &&
      expectedSalary !== "" &&
      (!Number.isFinite(Number(expectedSalary)) ||
        Number(expectedSalary) < 0)
    ) {
      return sendResponse(
        res,
        400,
        false,
        "Expected salary must be a non-negative number."
      );
    }

    const duplicate = await findActiveDuplicate(
      updatedCompany,
      updatedRole,
      application._id
    );

    if (duplicate) {
      return sendResponse(
        res,
        409,
        false,
        "Another active application already exists for this company and job role."
      );
    }

    application.companyName = updatedCompany.trim();
    application.jobRole = updatedRole.trim();

    if (jobType !== undefined) {
      application.jobType = jobType;
    }

    if (expectedSalary !== undefined) {
      application.expectedSalary =
        expectedSalary === null || expectedSalary === ""
          ? null
          : Number(expectedSalary);
    }

    if (notes !== undefined) {
      if (typeof notes !== "string") {
        return sendResponse(res, 400, false, "Notes must be text.");
      }

      application.notes = notes.trim();
    }

    await application.save();

    return sendResponse(
      res,
      200,
      true,
      "Job application updated successfully.",
      application
    );
  } catch (error) {
    return handleError(res, error);
  }
});

// --------------------------------------------------
// PATCH /api/applications/:id/status
// Change status according to the permitted workflow
// --------------------------------------------------
router.patch("/:id/status", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return sendResponse(res, 400, false, "Invalid application ID.");
    }

    const { status: newStatus } = req.body;

    if (!STATUSES.includes(newStatus)) {
      return sendResponse(res, 400, false, "Invalid application status.");
    }

    const application = await Application.findById(req.params.id);

    if (!application) {
      return sendResponse(res, 404, false, "Application not found.");
    }

    const permittedStatuses = ALLOWED_TRANSITIONS[application.status];

    if (!permittedStatuses.includes(newStatus)) {
      return sendResponse(
        res,
        400,
        false,
        `Cannot change status from ${application.status} to ${newStatus}.`
      );
    }

    application.status = newStatus;
    application.isOverdue = false;

    application.statusHistory.push({
      status: newStatus,
      changedAt: new Date()
    });

    await application.save();

    return sendResponse(
      res,
      200,
      true,
      "Application status updated successfully.",
      application
    );
  } catch (error) {
    return handleError(res, error);
  }
});

// --------------------------------------------------
// DELETE /api/applications/:id
// Deletion is permitted only for Applied or final statuses
// --------------------------------------------------
router.delete("/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return sendResponse(res, 400, false, "Invalid application ID.");
    }

    const application = await Application.findById(req.params.id);

    if (!application) {
      return sendResponse(res, 404, false, "Application not found.");
    }

    const deletableStatuses = ["Applied", ...FINAL_STATUSES];

    if (!deletableStatuses.includes(application.status)) {
      return sendResponse(
        res,
        400,
        false,
        "Applications in Interview or Offer status cannot be deleted."
      );
    }

    await Application.findByIdAndDelete(application._id);

    return sendResponse(
      res,
      200,
      true,
      "Job application deleted successfully.",
      { id: application._id }
    );
  } catch (error) {
    return handleError(res, error);
  }
});

module.exports = router;