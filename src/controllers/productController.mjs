import * as ProductModel from '../models/productModel.mjs'

export const createProduct = async (req, res) => {
    const { name, description, price, category_ids } = req.body
    const productId = await ProductModel.createProduct({ name, description, price }, category_ids)
    res.json({ productId })
}

export const filterProducts = async (req, res) => {
    const { name, category, page } = req.query

    const parsedPage = parseInt(page, 10) || 1
    const fixedLimit = 10
    const offset = (parsedPage - 1) * fixedLimit

    const { products, totalCount } = await ProductModel.getProducts({
        name,
        category,
        limit: fixedLimit,
        offset,
    })

    res.json({
        data: products,
        pagination: {
            total: totalCount,
            page: parsedPage,
            limit: fixedLimit,
            totalPages: Math.ceil(totalCount / fixedLimit)
        }
    })
}

export const getProduct = async (req, res) => {
    const product = await ProductModel.getProductById(req.params.id)
    if(!product) {
        res.status(404).json({ message: 'Product not found' })
    }
    res.json(product)
}

export const updateProduct = async (req, res) => {
    const { name, description, price, categories } = req.body
    await ProductModel.updateProduct(req.params.id, { name, description, price }, categories)
    res.json({ message: 'Product updated' })
}

export const deleteProduct = async (req, res) => {
    await ProductModel.deleteProduct(req.params.id)
    res.json({ message: 'Product deleted' })
}