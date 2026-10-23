(() => {
  // product_catalog/product_catalog.ts
  function getRequiredElement(selector) {
    const element = document.querySelector(selector);
    if (!element) {
      throw new Error(`Required catalog element not found: ${selector}`);
    }
    return element;
  }
  var basketCount = getRequiredElement('#basketCount');
  var detailsDialog = getRequiredElement('#productDetails');
  var detailsName = getRequiredElement('#detailsName');
  var detailsCategory = getRequiredElement('#detailsCategory');
  var detailsPrice = getRequiredElement('#detailsPrice');
  var detailsDescription = getRequiredElement('#detailsDescription');
  var detailsImage = getRequiredElement('#detailsImage');
  var closeDetailsButton = getRequiredElement('[data-close-details]');
  var basketItemCount = 0;
  const categoryButtons = document.querySelectorAll('[data-category-filter]');
  const productCards = document.querySelectorAll('[data-product-card]');
  const resultsCount = getRequiredElement('#resultsCount');
  let selectedCategory = null;

  categoryButtons.forEach((button) => {
    button.addEventListener('click', () => {
      selectedCategory =
        selectedCategory === button.dataset.categoryFilter
          ? null
          : button.dataset.categoryFilter;
      let visibleCount = 0;
      productCards.forEach((card) => {
        card.hidden =
          selectedCategory !== null &&
          card.dataset.category !== selectedCategory;
        visibleCount += Number(!card.hidden);
      });
      categoryButtons.forEach((categoryButton) => {
        categoryButton.setAttribute(
          'aria-pressed',
          String(categoryButton.dataset.categoryFilter === selectedCategory),
        );
      });
      resultsCount.textContent = `${visibleCount} ${visibleCount === 1 ? 'product' : 'products'}`;
    });
  });

  document.querySelectorAll('[data-view-details]').forEach((button) => {
    button.addEventListener('click', () => {
      const productName = button.dataset.productName ?? '';
      detailsName.textContent = productName;
      detailsCategory.textContent = button.dataset.productCategory ?? '';
      detailsPrice.textContent = button.dataset.productPrice ?? '';
      detailsDescription.textContent = button.dataset.productDescription ?? '';
      detailsImage.src = button.dataset.productImage ?? '';
      detailsImage.alt = productName;
      detailsDialog.showModal();
    });
  });
  closeDetailsButton.addEventListener('click', () => {
    detailsDialog.close();
  });
  detailsDialog.addEventListener('click', (event) => {
    if (event.target === detailsDialog) {
      detailsDialog.close();
    }
  });
  document.querySelectorAll('[data-add-to-basket]').forEach((button) => {
    button.addEventListener('click', () => {
      basketItemCount += 1;
      basketCount.textContent = `Basket (${basketItemCount})`;
    });
  });
})();
