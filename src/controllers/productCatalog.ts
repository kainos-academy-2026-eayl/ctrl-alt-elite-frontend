const dialog = document.querySelector<HTMLDialogElement>('#productDetails');
const name = document.querySelector<HTMLElement>('#detailsName');
const category = document.querySelector<HTMLElement>('#detailsCategory');
const price = document.querySelector<HTMLElement>('#detailsPrice');
const description = document.querySelector<HTMLElement>('#detailsDescription');
const image = document.querySelector<HTMLImageElement>('#detailsImage');

if (dialog && name && category && price && description && image) {
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    '[data-view-details]',
  )) {
    button.addEventListener('click', () => {
      const productName = button.dataset.productName ?? '';
      name.textContent = productName;
      category.textContent = button.dataset.productCategory ?? '';
      price.textContent = button.dataset.productPrice ?? '';
      description.textContent = button.dataset.productDescription ?? '';
      image.src = button.dataset.productImage ?? '';
      image.alt = productName;
      dialog.showModal();
    });
  }

  document
    .querySelector('[data-close-details]')
    ?.addEventListener('click', () => dialog.close());

  // A click on the backdrop lands on the dialog element itself.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
}

export {};
