import express from 'express';
import morgan from 'morgan';
import helmet from "helmet";
import compression from "compression"
import DatabaseFactory from "./dbs/db.factory.js";
import checkOverload from "./helpers/check.connect.js";

const app = express();

//init middleware
app.use(morgan("dev")) //log requests in dev mode
app.use(helmet()) //security headers
app.use(compression()) //reduce response size
app.use(express.json())

//init db
DatabaseFactory.getDatabase('mongodb');
checkOverload();

//init routes

//handling errors

export default app;
