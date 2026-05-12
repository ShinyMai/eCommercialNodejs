'use strict'

import mongoose from "mongoose";
import os from "os";
import process from "process";

const _SECONDS = 5000;

const checkOverload = () => {
    setInterval(() => {
        const numConnection = mongoose.connections.length;
        const numCores = os.cpus().length;
        const memoryUsage = process.memoryUsage().rss;

        console.log("Number of connections active: ", numConnection);
        console.log(`Memory usage: ${memoryUsage / 1024/ 1024} bytes`);

        //maximize the number of connections
        const maxConnection = numCores * 5;
        if(numConnection > maxConnection){
            console.log("Maximize the number of connections");
        }
    }, _SECONDS) //monitor every 5 seconds
}

export default checkOverload;