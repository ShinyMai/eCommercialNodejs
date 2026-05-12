import app from './src/app.js';
import mongoose from "mongoose";

const PORT = 3000;

const server = app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));

process.on('SIGINT', async () => {
    await mongoose.disconnect();
    server.close(() => console.log('Server closed'));


    process.exit(0);
});

