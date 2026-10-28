const mongoose = require("mongoose");

const statusHistorySchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: [
        "Applied",
        "Interview",
        "Rejected",
        "Offer",
        "Accepted",
        "Declined"
      ],
      required: true
    },
    changedAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
);

const applicationSchema = new mongoose.Schema(
  {
    applicationId: {
      type: String,
      required: true,
      unique: true,
      immutable: true
    },

    companyName: {
      type: String,
      required: true,
      trim: true
    },

    jobRole: {
      type: String,
      required: true,
      trim: true
    },

    jobType: {
      type: String,
      required: true,
      enum: ["Full-time", "Internship", "Contract"]
    },

    appliedDate: {
      type: Date,
      required: true,
      immutable: true,
      validate: {
        validator: function (value) {
          const today = new Date();
          today.setHours(23, 59, 59, 999);
          return value <= today;
        },
        message: "Applied date cannot be in the future."
      }
    },

    expectedSalary: {
      type: Number,
      min: 0,
      default: null
    },

    notes: {
      type: String,
      trim: true,
      default: ""
    },

    status: {
      type: String,
      enum: [
        "Applied",
        "Interview",
        "Rejected",
        "Offer",
        "Accepted",
        "Declined"
      ],
      default: "Applied",
      required: true
    },

    statusHistory: {
      type: [statusHistorySchema],
      default: function () {
        return [
          {
            status: "Applied",
            changedAt: new Date()
          }
        ];
      }
    },

    followUpDate: {
      type: Date,
      required: true
    },

    isOverdue: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

applicationSchema.index({
  companyName: 1,
  jobRole: 1,
  status: 1
});

module.exports = mongoose.model("Application", applicationSchema);