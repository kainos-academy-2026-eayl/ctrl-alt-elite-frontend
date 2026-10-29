import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { CatalogController } from '../src/server/controllers/catalog-controller';
import type { CatalogService } from '../src/server/services/catalog-service';

describe('CatalogController.showProducts', () => {
  it('renders the products and categories returned by the service', async () => {
    const products = [
      {
        id: 'product-1',
        name: 'Test headphones',
        category: 'Audio',
        price: 25,
        image: 'https://example.com/headphones.jpg',
        description: 'A test product.',
        stock: 12,
        stockLabel: '12 in stock',
        available: true,
        priceLabel: 'GBP 25.00',
      },
    ];
    const categories = ['Audio'];
    const getProducts = vi
      .fn<CatalogService['getProducts']>()
      .mockResolvedValue({ products, categories });
    const service = { getProducts } as unknown as CatalogService;
    const controller = new CatalogController(service);
    const request = {} as Request;
    const render = vi.fn();
    const status = vi.fn().mockReturnThis();
    const response = { render, status } as unknown as Response;

    await controller.showProducts(request, response);

    expect(getProducts).toHaveBeenCalledExactlyOnceWith();
    expect(render).toHaveBeenCalledExactlyOnceWith('product.njk', {
      products,
      categories,
    });
    expect(status).not.toHaveBeenCalled();
  });

  it('renders a safe error with status 502 when the service fails', async () => {
    const error = new Error('Private backend error');
    const getProducts = vi
      .fn<CatalogService['getProducts']>()
      .mockRejectedValue(error);
    const service = { getProducts } as unknown as CatalogService;
    const controller = new CatalogController(service);
    const request = {} as Request;
    const render = vi.fn();
    const status = vi.fn().mockReturnThis();
    const response = { render, status } as unknown as Response;
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      await controller.showProducts(request, response);

      expect(getProducts).toHaveBeenCalledExactlyOnceWith();
      expect(status).toHaveBeenCalledExactlyOnceWith(502);
      expect(render).toHaveBeenCalledExactlyOnceWith('product.njk', {
        products: [],
        productError: 'Products are temporarily unavailable.',
      });
      expect(errorLog).toHaveBeenCalledExactlyOnceWith(
        'Unable to load products from the backend:',
        error,
      );
    } finally {
      errorLog.mockRestore();
    }
  });
});


