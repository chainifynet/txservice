import { config, DynamoDB, SQS } from "aws-sdk";
import * as mysql from "mysql2/promise";
import { awsRegion, rds } from "./variables";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore:next-line
config.update({ region: awsRegion });

export const rdsConn = mysql.createPool({
  host: rds.host,
  port: rds.port,
  user: rds.user,
  password: rds.pass,
  database: rds.name,
  connectionLimit: 4,
  enableKeepAlive: true,
  supportBigNumbers: true,
  bigNumberStrings: true,
  multipleStatements: true,
});

export const ddbClient = new DynamoDB.DocumentClient({ apiVersion: "2012-08-10" });
export const sqsClient = new SQS({ apiVersion: "2012-11-05" });
