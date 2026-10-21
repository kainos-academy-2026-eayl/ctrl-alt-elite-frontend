---
agent: agent
model: Claude Haiku 5.5
description: Shopping cart functionality for adding items to a basket and proceeding to checkout.
---

Shopping cart

Context

Build a shopping cart that allows customers browsing products to add items to a basket and proceed to checkout with all chosen items and quantities ready for review and purchase.

Description

As a customer browsing products,
I want to add items to my shopping cart and proceed to checkout,
So that all my chosen items and quantities are waiting for me on the checkout page to review and purchase.


Scope

Add items to basket: Customers can click an “Add to Cart / Basket” button on any product.

Items are automatically added with a default quantity of 1.

A notification or visual update is shown when an item is added.

View and manage basket contents: Customers can click the cart icon to view current items, quantities, unit prices, line totals, and the overall cart total.

Customers can increase or decrease item quantities.

Customers can remove an item completely from the basket.

Hand over items to checkout: When customers click “Checkout”, all current basket items, quantities, and price calculations are taken directly to the Checkout page.

The Checkout page accurately reflects exactly what was in the basket at the moment “Checkout” was clicked.

MVP scope: Client-side / session cart state, cart icon badge, cart summary view, quantity/remove controls, and data transfer to the checkout page.

Out of scope

Payment gateway integration.

User authentication/login persistence.

Coupon/discount codes.

Future ticket items outside the MVP.

Acceptance criteria

Happy path

AC1: Adding to Basket

Given I am viewing a product

When I click “Add to Basket”

Then the product is added to the cart and the cart item count updates immediately.

AC2: Managing Items

Given I have items in my basket

When I change an item’s quantity or remove an item

Then the line total and overall cart total recalculate automatically.

AC3: Passing Items to Checkout

Given I have items in my basket

When I click the “Checkout” button

Then I am navigated to the checkout page and the checkout page displays the exact items, quantities, and totals from my basket.

Error path

AC4: Empty Basket Validation

Given my basket has no items

When I view the basket

Then I cannot proceed to checkout and I see an empty basket message.

The “Checkout” button is disabled or hidden if the basket is empty.

A friendly empty basket message is shown, for example “Your basket is empty”, with a link back to browse products.

System failure

Given the customer has items in their basket and tries to go to checkout

When the basket details cannot be sent to checkout

Then the customer must not see wrong checkout information, the system should keep or recover the basket where possible, the customer should see a clear message explaining what to do next

Assumptions / dependencies

Product pages expose an “Add to Cart / Basket” action.

The checkout page can receive and display basket items, quantities, unit prices, line totals, and the overall cart total.

Prices and product information are available when calculating basket totals.

This MVP uses client-side / session cart state rather than authenticated persistent cart storage.

Tech notes

Update the cart icon badge immediately when items are added or changed.

Recalculate line totals and the overall cart total automatically after quantity changes or item removal.

Transfer the exact basket contents and price calculations to the checkout page at the moment “Checkout” is clicked.

Definition of done

Customers can add products to the basket with a default quantity of 1.

Customers can view basket contents, quantities, unit prices, line totals, and overall cart total.

Customers can increase, decrease, and remove items from the basket.

Checkout receives and displays the exact basket state from the point the customer clicked “Checkout”.

Empty basket behaviour prevents checkout and displays a helpful message with a route back to browse products.

All acceptance criteria for happy path, error path, and system failure handling have been met.

