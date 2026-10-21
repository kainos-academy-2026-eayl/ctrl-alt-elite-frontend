import express, { type Express, type Request, type Response } from 'express';
import nunjucks from 'nunjucks';
import { fileURLToPath } from 'node:url';

const PRODUCT_CATALOG_DIRECTORY = fileURLToPath(
    new URL('../product_catalog/', import.meta.url),
);
const PRODUCT_TEMPLATE_DIRECTORY = fileURLToPath(
    new URL('../templates/', import.meta.url),
);

const DEMO_PRODUCTS = [
    {
        id: 'studio-headphones',
        name: 'Studio Wireless Headphones',
        category: 'Audio',
        price: 129.99,
        image:
            'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=85',
        description:
            'Comfortable over-ear headphones with clear sound for music, calls, and focused work.',
    },
    {
        id: 'mirrorless-camera',
        name: 'Compact Mirrorless Camera',
        category: 'Photography',
        price: 549.0,
        image:
            'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=900&q=85',
        description:
            'A portable camera for capturing detailed photos and video while travelling.',
    },
    {
        id: 'steel-watch',
        name: 'Minimal Steel Watch',
        category: 'Wearables',
        price: 89.5,
        image:
            'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=85',
        description:
            'A clean, everyday watch with a stainless-steel finish and simple dial.',
    },
    {
        id: 'portable-speaker',
        name: 'Portable Bluetooth Speaker',
        category: 'Audio',
        price: 64.99,
        image:
            'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?auto=format&fit=crop&w=900&q=85',
        description:
            'A compact speaker designed to bring your playlists into any room.',
    },
];

export function registerProductApp(app: Express): void {
    nunjucks.configure(PRODUCT_TEMPLATE_DIRECTORY, {
        autoescape: true,
        express: app,
    });
    app.set('view engine', 'njk');

    app.use(
        '/product-catalog',
        express.static(PRODUCT_CATALOG_DIRECTORY, { index: false }),
    );

    app.get('/products', (_req: Request, res: Response) => {
        const products = DEMO_PRODUCTS.map((product) => ({
            ...product,
            priceLabel: new Intl.NumberFormat('en-GB', {
                style: 'currency',
                currency: 'GBP',
            }).format(product.price),
            searchText: `${product.name} ${product.category}`.toLowerCase(),
        }));

        res.render('product.njk', { products });
    });
}