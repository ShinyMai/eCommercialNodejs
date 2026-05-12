import app from './src/app.js';
import mongoose from "mongoose";
import config from "@/configs/config.mongodb.js";

const server = app.listen(config.app.port, () => console.log(`Server is running on port ${config.app.port}`));

process.on('SIGINT', async () => {
    await mongoose.disconnect();
    server.close(() => console.log('Server closed'));


    process.exit(0);
});

