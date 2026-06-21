'use strict';

import {Router} from 'express';
import AccessController from '@/controllers/access.controller.js';

const router = Router();

router.post("/shop/signup", AccessController.shopSignup)

export default router;