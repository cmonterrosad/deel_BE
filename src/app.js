const express = require("express");
const bodyParser = require("body-parser");
const { sequelize } = require("./model");
const { getProfile } = require("./middleware/getProfile");
const { Op } = require("sequelize");
const app = express();
app.use(bodyParser.json());
app.set("sequelize", sequelize);
app.set("models", sequelize.models);

/**
 * 
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

/**
 * Returns a list of contracts belonging to a user (client or contractor)
 * .The list should only contain non terminated contracts.
 */
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
/**
 * Get all unpaid jobs for a user (either a client or contractor), for active contracts only.
 */
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
/**
 * Pay for a job, a client can only pay if his balance >= the amount to pay.
 * The amount should be moved from the client's balance to the contractor balance.
 */
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

/**
 * Deposits money into the the the balance of a client.
 *  A client can't deposit more than 25% his total of jobs to pay. (at the deposit moment)
 */
app.post("/balances/deposit/:userId", getProfile, async (req, res) => {
  const { Job } = req.app.get("models");
  const { Contract } = req.app.get("models");
  const { Profile } = req.app.get("models");
  const { userId } = req.params;
  const profile = await Profile.findOne({where:{id:userId}});
  if(!profile) return res.status(404).end();
  const jobsTotalBalance = await Job.findOne({
    include: {
      model: Contract,
      required: true,
      where: {
        [Op.or]: [
          { ClientId: userId },
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
  const {
    dataValues: { totalJobs },
  } = jobsTotalBalance;

  if (deposit > totalJobs * 1.25) {
    return res
      .status(406)
      .json({ error: "Deposit amount is more that 25% of total jobs to pay" })
      .end();
  }
  
  profile.balance = deposit;
  await profile.save({ profile });
  res.status(200).end();
});

/**
 * Returns the profession that earned the most money (sum of jobs paid)
 *  for any contactor that worked in the query time range.
 */
app.get("/admin/best-profession", async (req, res) => {
    const { Job } = req.app.get("models");
    const { Contract } = req.app.get("models");
    const {Profile} = req.app.get('models')
    const { start,end } = req.query;
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
    const map = jobsTotalBalance.map(jobs => ({
        profession:jobs.Contract.Contractor.profession,
        fullName:jobs.Contract.Contractor.firstName + " " + jobs.Contract.Contractor.lastName,
        paid:jobs.dataValues.totalJobs
    }))
    
    res.json(map).end();
  });
  /**
   * returns the clients the paid the most for jobs in the query time period.
   * Limit query parameter should be applied, default limit is 2.
   */
  app.get("/admin/best-client", async (req, res) => {
    const { Job } = req.app.get("models");
    const { Contract } = req.app.get("models");
    const {Profile} = req.app.get('models')
    let { start,end,limit } = req.query;
    if(limit == null){
        limit = 2;
    }
    const jobsTotalBalance = await Job.findAll({
      include: {
        attributes:['ClientId'],
        model: Contract,
        required: true,
        where: {
          status: { [Op.not]: "terminated" },
        },
        include:{
          attributes:['firstName','lastName'],
          model: Profile,
          as:'Client',
          required: true
        },
      },
      group: "ClientId",
      attributes: [[sequelize.fn("SUM", sequelize.col("price")), "totalJobs"]],
      limit,
      where: {
        paid:  { [Op.eq]: true },
        paymentDate: {[Op.between]: [start,end]}
  
      },
    });
    if (!jobsTotalBalance) return res.status(404).end();
    const map = jobsTotalBalance.map(jobs => ({
        id:jobs.Contract.ClientId,
        fullName:jobs.Contract.Client.firstName + " " + jobs.Contract.Client.lastName,
        paid:jobs.dataValues.totalJobs
    }))
    res.json(map).end();
  });
module.exports = app;
