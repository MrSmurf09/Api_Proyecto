import { Router } from 'express'
import * as categoryController from '../controllers/categoryController.mjs'

const router = Router()

router.post("/", categoryController.createCategory)

export default router