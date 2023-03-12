const express = require("express");
const bodyParser = require("body-parser");
const { sequelize, Profile, Job } = require("./model");
const { getProfile } = require("./middleware/getProfile");
const { Op } = require("sequelize");
const app = express();
app.use(bodyParser.json());
app.set("sequelize", sequelize);
app.set("models", sequelize.models);

/**
 * FIX ME!
 * @returns contract by id
 */
app.get("/contracts/:id", getProfile, async (req, res) => {
  const { Contract } = req.app.get("models");
  const { id } = req.params;
  const contract = await Contract.findOne({
    where: { id, ClientId: req.profile.id },
  });
  if (!contract) return res.status(404).end();
  res.json(contract);
});
app.get("/contracts", getProfile, async (req, res) => {
  const { Contract } = req.app.get("models");
  const contract = await Contract.findAll({
    where: {
      [Op.or]: [{ ClientId: req.profile.id }, { ContractorId: req.profile.id }],
      status: { [Op.not]: "terminated" },
    },
  });
  if (!contract) return res.status(404).end();
  res.json(contract);
});
app.get("/jobs/unpaid", getProfile, async (req, res) => {
  const { Job } = req.app.get("models");
  const { Contract } = req.app.get("models");
  const jobs = await Job.findAll({
    include: {
      model: Contract,
      required: true,
      where: {
        [Op.or]: [
          { ClientId: req.profile.id },
          { ContractorId: req.profile.id },
        ],
        status: { [Op.not]: "terminated" },
      },
    },
    where: {
      paid: { [Op.or]: [{ [Op.eq]: null }, { [Op.eq]: false }] },
    },
  });
  if (!jobs) return res.status(404).end();
  res.json(jobs);
});
app.post("/jobs/:job_id/pay", getProfile, async (req, res) => {
  const { Job } = req.app.get("models");
  const { Contract } = req.app.get("models");
  const { job_id } = req.params;
  const transaction = await sequelize.transaction();
  let job;
  try {
    job = await Job.findOne({
      include: {
        model: Contract,
        required: true,
        where: { status: { [Op.not]: "terminated" } },
      },
      where: {
        id: job_id,
      },
      lock: true,
      transaction,
    });
  } catch (err) {
    await transaction.rollback();
    return next(err);
  }
  if (!job) return res.status(404).end();
  if (req.profile.balance >= job.price) {
    job.Contract.balance = req.profile.balance;
    try {
      await job.save({ transaction });
    } catch (err) {
      await transaction.rollback();
      return res.status(404).end();
    }
    await transaction.commit();

    const profile = req.profile;
    profile.balance = 0;
    await profile.save({ profile });
  }

  res.json(job);
});

app.post("/balances/deposit/:userId", getProfile, async (req, res) => {
  const { Job } = req.app.get("models");
  const { Contract } = req.app.get("models");
  const { job_id } = req.params;
  console.log(req.params);
  const jobsTotalBalance = await Job.findOne({
    include: {
      model: Contract,
      required: true,
      where: {
        [Op.or]: [
          { ClientId: req.profile.id },
          { ContractorId: req.profile.id },
        ],
        status: { [Op.not]: "terminated" },
      },
    },
    attributes: [[sequelize.fn("SUM", sequelize.col("price")), "totalJobs"]],
    where: {
      paid: { [Op.or]: [{ [Op.eq]: null }, { [Op.eq]: false }] },
    },
  });
  if (!jobsTotalBalance) return res.status(404).end();
  console.log(deposit);
  const {
    dataValues: { totalJobs },
  } = jobsTotalBalance;

  if (deposit > totalJobs * 1.25) {
    return res
      .status(406)
      .json({ error: "Deposit amount is more that 25% of total jobs to pay" })
      .end();
  }
  const profile = req.profile;
  profile.balance = deposit;
  await profile.save({ profile });
  res.json(jobsTotalBalance).end();
});

app.get("/best-profession", async (req, res) => {
    const { Job } = req.app.get("models");
    const { Contract } = req.app.get("models");
    const {Profile} = req.app.get('models')
    const { start,end } = req.query;
    console.log(start);
    console.log(end);
    const jobsTotalBalance = await Job.findAll({
      include: {
        model: Contract,
        required: true,
        where: {
          status: { [Op.not]: "terminated" },
        },
        include:{
          model: Profile,
          as:'Client',
          required: true
        },
        include:{
            model: Profile,
            as:'Contractor',
            required: true
          },
      },
      group: "profession",
      attributes: [[sequelize.fn("SUM", sequelize.col("price")), "totalJobs"]],
      where: {
        paid:  { [Op.eq]: true },
        paymentDate: {[Op.between]: [start,end]}
  
      },
    });
    if (!jobsTotalBalance) return res.status(404).end();
    res.json(jobsTotalBalance).end();
  });

app.get("/admin/best-profession?start=<date>&end=<date>", async (req, res) => {
  const { Job } = req.app.get("models");
  const { Contract } = req.app.get("models");
  const {Profile} = req.app.get('models')
  const { deposit } = req.body;
  const jobsTotalBalance = await Job.findOne({
    include: {
      model: Contract,
      required: true,
      where: {
        status: { [Op.not]: "terminated" },
      },
      include:{
        model: Profile,
        required: true
      },
    },
    where: {
      paid: {  [Op.eq]: true },

    },
  });
  if (!jobsTotalBalance) return res.status(404).end();
  res.json(jobsTotalBalance).end();
});
module.exports = app;
