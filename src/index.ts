import "dotenv/config";

import * as Koa from "koa";
import { koaBody } from "koa-body";
import * as cors from "koa2-cors";
import { rdsConn } from "./config/aws";

import { appHost, appPort, serviceName, isTestnet } from "./config/variables";
import { logger } from "./config/logger";
import { routes, allowedMethods } from "./routes";
import {
  applyCommonMiddlewares,
  interceptTracingError,
  KoaMiddlewareCtx,
  koaTracer,
  MemoryCache,
} from "@chainifynet/common-libs-node";
import * as assetStore from "./services/store/asset";
import { exit } from "process";
import { populateGlobalAssetCache } from "./common/asset";

const app = new Koa();

const memoryCache = new MemoryCache();
memoryCache.configure();

applyCommonMiddlewares(app, logger, koaBody(), memoryCache);

assetStore.getAllAssets(!isTestnet).then((assets) => {
  populateGlobalAssetCache(assets);
}).catch((err) => {
  logger.error("Error loading assets", err);
  exit(1);
});

app.use(async (ctx: KoaMiddlewareCtx, next) => {
  try {
    await next();
  } catch (err) {
    ctx.log.error({ err });
    interceptTracingError(ctx, err);
    ctx.status = err.status || 500;
    if (err.errors) {
      ctx.body = err.errors; // validation errors
    } else {
      if (ctx.status === 500) {
        ctx.body = { error: "Internal Server Error" };
      } else {
        ctx.body = { error: err.message };
      }
    }
  }
});
app.use(cors({ origin: "*" }));
app.use(routes);
app.use(allowedMethods);

app
  .listen(appPort, appHost)
  .on("listening", async () => {
    await koaTracer(app, serviceName, logger);
    logger.info(`Server running on port ${appPort}`);
  })
  .on("close", () => {
    rdsConn.end();
    logger.info("on close");
  })
  .on("error", (err) => {
    rdsConn.end();
    logger.error("on error", err);
  });
