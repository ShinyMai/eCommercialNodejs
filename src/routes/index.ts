'use strict';

import {Router} from 'express';
import accessRouter from '@/routes/access/index.js';


const router = Router();
router.use('/v1/api', accessRouter)

export default router;