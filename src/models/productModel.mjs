import db from '../config/db.mjs'

export const createProduct = async (product, category_ids) => {
    if(!category_ids) {
        throw new Error('Category ids are required')
    }
    const [product_id] = await db('products').insert(product)
    const relations = category_ids.map(category_id => ({
        product_id: product_id,
        category_id,
    }))
    await db('product_categories').insert(relations)
    return product_id
}

export const getProducts = async ({ name, category, limit, offset }) => {
    // base para filtros
    const baseQuery = db('products')
        .join('product_categories', 'products.product_id', 'product_categories.product_id')
        .join('category', 'category.category_id', 'product_categories.category_id')

    if(name) {
        baseQuery.where('products.name', 'like', `%${name}%`)
    }
    if(category) {
        baseQuery.where('category.name', 'like', `%${category}%`)
    }

    //conteo total
    const countQuery = baseQuery.clone().countDistinct('products.product_id as total')
    const countResult = await countQuery.first()
    const totalCount = parseInt(countResult.total, 10)

    //productos paginados
    const products = await baseQuery
        .clone()
        .select('products.*')
        .groupBy('products.product_id')
        .limit(limit)
        .offset(offset)

    const products_ids = products.map(product => product.product_id)

    // consulta de categorias asociadas a productos
    const categoryRows = await db('product_categories')
        .join('category', 'category.category_id', 'product_categories.category_id')
        .whereIn('product_categories.product_id', products_ids)
        .select('product_categories.product_id', 'category.category_id', 'category.name')

    // agrupar categorias a producto
    const categoriesMap = {}
    categoryRows.forEach(row => {
        if(!categoriesMap[row.product_id]) categoriesMap[row.product_id] =[]
        categoriesMap[row.product_id].push({
            category_id: row.category_id,
            name: row.name,
        })
    })

    // añadir categorias al resultado de productos
    const productsWithCategories = products.map(product => ({
        ...product,
        categories: categoriesMap[product.product_id] || []
    }))

    return {
        products: productsWithCategories,
        totalCount
    }
}

export const getProductById = async (id) => {
    return db('products').where('product_id', id).first()
}

export const updateProduct = async (id, product, category_ids) => {
    if(!id) {
        throw new Error('Product id is required')
    }
    if(!product) {
        throw new Error('Product is required')
    }
    if(!category_ids) {
        throw new Error('Category ids are required')
    }
    await db('products').where('product_id', id).update(product)
    if(category_ids) {
        await db('product_categories').where({ product_id: id }).del()
        const relations = category_ids.map(category_id => ({
            product_id: id,
            category_id,
        }))
        await db('product_categories').insert(relations)
    }
}

export const deleteProduct = async (id) => {
    await db('products').where('product_id', id).del()
}