(() => {
  // product_catalog/product_catalog.ts
  function getRequiredElement(selector) {
    const element = document.querySelector(selector);
    if (!element) {
      throw new Error(`Required catalog element not found: ${selector}`);
    }
    return element;
  }
  var searchInput = getRequiredElement('#productSearch');
  var productCards = Array.from(
    // Changed
    document.querySelectorAll('[data-product-card]'),
    // Changed
  );
  var resultsCount = getRequiredElement('#resultsCount');
  var noSearchResults = getRequiredElement('#noSearchResults');
  var basketCount = getRequiredElement('#basketCount');
  var detailsDialog = getRequiredElement('#productDetails');
  var detailsName = getRequiredElement('#detailsName');
  var detailsCategory = getRequiredElement('#detailsCategory');
  var detailsPrice = getRequiredElement('#detailsPrice');
  var detailsDescription = getRequiredElement('#detailsDescription');
  var detailsImage = getRequiredElement('#detailsImage');
  var closeDetailsButton = getRequiredElement('[data-close-details]');
  var basketItemCount = 0;
  searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim().toLocaleLowerCase();
    let visibleCount = 0;
    for (const card of productCards) {
      const matches = (card.dataset.search ?? '').includes(query);
      card.hidden = !matches;
      visibleCount += Number(matches);
    }
    resultsCount.textContent = `${visibleCount} ${visibleCount === 1 ? 'product' : 'products'}`;
    noSearchResults.hidden = visibleCount > 0;
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
