// (() => {
//   function getRequiredElement<ElementType extends HTMLElement>(
//     selector: string,
//   ): ElementType {
//     const element = document.querySelector<ElementType>(selector);
//     if (!element) {
//       throw new Error(`Required catalog element not found: ${selector}`);
//     }
//     return element;
//   }

//import { title } from "node:process";

//   const basketCount = getRequiredElement<HTMLElement>('#basketCount');
//   const detailsDialog =
//     getRequiredElement<HTMLDialogElement>('#productDetails');
//   const detailsName = getRequiredElement<HTMLElement>('#detailsName');
//   const detailsCategory = getRequiredElement<HTMLElement>('#detailsCategory');
//   const detailsPrice = getRequiredElement<HTMLElement>('#detailsPrice');
//   const detailsDescription = getRequiredElement<HTMLElement>(
//     '#detailsDescription',
//   );
//   const detailsImage = getRequiredElement<HTMLImageElement>('#detailsImage');
//   const closeDetailsButton = getRequiredElement<HTMLButtonElement>(
//     '[data-close-details]',
//   );
//   let basketItemCount = 0;
//   const categoryButtons = document.querySelectorAll<HTMLButtonElement>(
//     '[data-category-filter]',
//   );
//   const productCards = document.querySelectorAll<HTMLElement>(
//     '[data-product-card]',
//   );
//   const resultsCount = getRequiredElement<HTMLElement>('#resultsCount');
//   let selectedCategory: string | null = null;

//   categoryButtons.forEach((button) => {
//     button.addEventListener('click', () => {
//       const category = button.dataset.categoryFilter ?? '';
//       selectedCategory = selectedCategory === category ? null : category;
//       let visibleCount = 0;
//       productCards.forEach((card) => {
//         card.hidden =
//           selectedCategory !== null &&
//           card.dataset.category !== selectedCategory;
//         visibleCount += Number(!card.hidden);
//       });
//       categoryButtons.forEach((categoryButton) => {
//         categoryButton.setAttribute(
//           'aria-pressed',
//           String(categoryButton.dataset.categoryFilter === selectedCategory),
//         );
//       });
//       resultsCount.textContent = `${visibleCount} ${visibleCount === 1 ? 'product' : 'products'}`;
//     });
//   });

//   document
//     .querySelectorAll<HTMLButtonElement>('[data-view-details]')
//     .forEach((button) => {
//       button.addEventListener('click', () => {
//         const productName = button.dataset.productName ?? '';
//         detailsName.textContent = productName;
//         detailsCategory.textContent = button.dataset.productCategory ?? '';
//         detailsPrice.textContent = button.dataset.productPrice ?? '';
//         detailsDescription.textContent =
//           button.dataset.productDescription ?? '';
//         detailsImage.src = button.dataset.productImage ?? '';
//         detailsImage.alt = productName;
//         detailsDialog.showModal();
//       });
//     });
//   closeDetailsButton.addEventListener('click', () => {
//     detailsDialog.close();
//   });
//   detailsDialog.addEventListener('click', (event) => {
//     if (event.target === detailsDialog) {
//       detailsDialog.close();
//     }
//   });
//   document
//     .querySelectorAll<HTMLButtonElement>('[data-add-to-basket]')
//     .forEach((button) => {
//       button.addEventListener('click', () => {
//         basketItemCount += 1;
//         basketCount.textContent = `Basket (${basketItemCount})`;
//       });
//     });
// })();

const catalogePage = {
  title: 'Product Catalog',
  description: 'Browse our selection of products',
  products: [
    {
      name: 'Product Name',
      category: 'Product Category',
      price: 'Product Price',
      description: 'Product Description',
      image: {
        src: '',
        alt: 'Product Image',
      },
    },
  ],
};

export default catalogePage;
