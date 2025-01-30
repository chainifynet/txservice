import { AppCtx } from "@chainifynet/common-libs-node";
import { sqsClient } from "../../config/aws";
import { jobQueue } from "../../config/variables";
import { SqsJobRequest } from "../../types/types";

export const initiateJob = async (
  appCtx: AppCtx,
  orgId: string,
  job: SqsJobRequest,
  groupId?: string
): Promise<void> => {
  await sqsClient
    .sendMessage({
      MessageAttributes: {
        messageType: {
          DataType: "String",
          StringValue: job.type,
        },
        orgId: {
          DataType: "String",
          StringValue: orgId,
        },
        requestId: {
          DataType: "String",
          StringValue: appCtx.reqId,
        },
      },
      MessageBody: JSON.stringify(job),
      MessageDeduplicationId: job.jobId,
      MessageGroupId: groupId || job.jobId,
      QueueUrl: jobQueue,
    })
    .promise();
};
