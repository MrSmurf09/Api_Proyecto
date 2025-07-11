import { Router } from 'express'
import * as productController from '../controllers/productController.mjs'

const router = Router()

router.post("/", productController.createProduct)
router.get("/", productController.filterProducts)
router.get("/:id", productController.getProduct)
router.put("/:id", productController.updateProduct)
router.delete("/:id", productController.deleteProduct)

export default router