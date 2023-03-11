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
  try{
  job = await Job.findOne({
    include: {
      model: Contract,
      required: true,
      where: { status: { [Op.not]: "terminated" } },
    },
    where: {
      id: job_id,
    },
    lock:true,
    transaction
  });
} catch (err){
    await transaction.rollback();
    return next(err);
}
  if (!job) return res.status(404).end();
  if(req.profile.balance >= job.price ){
    job.Contract.balance = req.profile.balance;
    try{
        await job.save({transaction})
    } catch(err){
        await transaction.rollback();
        return res.status(404).end();
    }
    await transaction.commit();

    const profile = req.profile;
    profile.balance = 0
    await profile.save({profile});
    
  }
  
  res.json(job);
});
module.exports = app;
