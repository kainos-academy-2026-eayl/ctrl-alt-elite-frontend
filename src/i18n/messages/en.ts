/*
 * English text for every customer page. This is the complete set: the other
 * languages (cy.ts, ga.ts, fr.ts) translate these keys and fall back to
 * English for any they are missing.
 *
 * - {name} is a placeholder, filled in by t(key, { name }).
 * - Keys ending in .one / .other are plural forms used by tCount().
 * - Keys starting with "js." are also sent to browser scripts.
 * - "category.X" translates a product category; "delivery.X" a delivery option.
 */
const en = {
  // Every page
  'site.name': 'Ctrl-Alt-Elite',
  'site.home': 'Ctrl-Alt-Elite home',
  'site.skipToContent': 'Skip to main content',
  'site.mainNavigation': 'Main navigation',
  'site.copyright': '© {year} Ctrl-Alt-Elite',
  'site.backToHome': 'Back to home',
  'site.home.link': 'Home',

  // Floating accessibility, language and currency menu
  'preferences.button': 'Accessibility, language and currency',
  'preferences.heading': 'Accessibility',
  'preferences.label': 'Language and currency',
  'preferences.language': 'Language',
  'preferences.currency': 'Currency',
  'preferences.position': 'Button position',
  'preferences.position.bottom-right': 'Bottom right',
  'preferences.position.bottom-left': 'Bottom left',
  'preferences.position.top-right': 'Top right',
  'preferences.position.top-left': 'Top left',
  'preferences.apply': 'Save',
  'preferences.close': 'Close',
  'preferences.dragHint': 'You can also drag this button to another corner.',
  'preferences.approxNote':
    'Prices in {currency} are approximate. You always pay in pounds (£).',

  // Header
  'header.basketShort': 'Basket',
  'header.basket.one': 'Basket, {count} item',
  'header.basket.other': 'Basket, {count} items',
  'account.label': 'Account',
  'account.options': '{name} options',
  'account.profile': 'My Profile',
  'account.dashboard': 'Dashboard',
  'account.logout': 'Logout',
  'account.login': 'Login',
  'account.register': 'Register',
  'account.support': 'Support',
  'account.profileError':
    'Saved profile details could not be loaded. Open your profile to retry.',
  'search.label': 'Search products',
  'search.placeholder': 'Search products',
  'search.button': 'Search',

  // Counts
  'count.items.one': '{count} item',
  'count.items.other': '{count} items',
  'count.products.one': '{count} product',
  'count.products.other': '{count} products',

  // Homepage
  'home.title': 'Ctrl-Alt-Elite | Home',
  'home.description': 'Welcome to Ctrl-Alt-Elite. Log in or browse products.',
  'home.eyebrow': 'Welcome to Ctrl-Alt-Elite',
  'home.heading': 'Find your next favourite.',
  'home.intro':
    'Explore our collection and find something made for your everyday.',
  'home.browse': 'Browse Products',
  'home.conveyor': 'Shop our range',
  'home.featured': 'Featured products',

  // Product cards and pages
  'product.viewDetails': 'View details',
  'product.viewDetailsOf': 'View details of {name}',
  'product.addToBasket': 'Add to Basket',
  'product.inStock': 'In Stock',
  'product.outOfStock': 'Out of Stock',
  'product.stockCount': '{count} in stock',
  'product.stockOut': 'Out of stock',
  'product.stockUnknown': 'Stock unavailable',
  'product.browseAll': 'Browse all products',
  'product.detailDescription': '{name} at Ctrl-Alt-Elite.',

  // Product catalogue
  'catalogue.title': 'Product catalogue | Ctrl-Alt-Elite',
  'catalogue.description': 'Browse the Ctrl-Alt-Elite product catalogue.',
  'catalogue.eyebrow': 'Shop',
  'catalogue.heading': 'Product catalogue',
  'catalogue.intro': 'Browse the latest products from Ctrl-Alt-Elite.',
  'catalogue.products': 'Products',
  'catalogue.empty': 'There are no products to show right now.',
  'catalogue.unavailable': 'Products are temporarily unavailable.',
  'catalogue.noMatches':
    'No products match your filters. Remove a filter or choose Clear all.',
  'catalogue.showing': 'Showing {count} of {total}',
  'catalogue.goHome': 'Go Home',

  // Search
  'search.title': 'Ctrl-Alt-Elite | Search',
  'search.description': 'Search Ctrl-Alt-Elite products by name or category.',
  'search.heading': 'Search results',
  'search.prompt': 'Enter a product name or keyword to search.',
  'search.none':
    'No products found for "{term}". Try a different name or keyword.',
  'search.noFilterMatches':
    'No products match your filters for "{term}". Remove a filter or choose Clear all.',
  'search.found.one': '{count} product found for "{term}".',
  'search.found.other': '{count} products found for "{term}".',
  'search.showing': 'Showing {count} of {total} found for "{term}".',
  'search.closest.one':
    'No exact matches for "{term}". Showing the closest match.',
  'search.closest.other':
    'No exact matches for "{term}". Showing the closest matches.',
  'search.unavailable':
    'Search is unavailable right now. Please try again in a little while.',

  // Filter and sort
  'filters.toggle': 'Filter & sort',
  'filters.active.one': '{count} active filter',
  'filters.active.other': '{count} active filters',
  'filters.sortedBy': 'sorted by {sort}',
  'filters.sortBy': 'Sort by',
  'filters.sort.recommended': 'Recommended',
  'filters.sort.price-asc': 'Price: low to high',
  'filters.sort.price-desc': 'Price: high to low',
  'filters.sort.newest': 'Newest first',
  'filters.sort.oldest': 'Oldest first',
  'filters.sort.most-bought': 'Most bought',
  'filters.sort.name-asc': 'Name: A to Z',
  'filters.sort.name-desc': 'Name: Z to A',
  'filters.availability': 'Availability',
  'filters.inStock': 'In stock',
  'filters.outOfStock': 'Out of stock',
  'filters.category': 'Category',
  'filters.price': 'Price',
  'filters.anyPrice': 'Any price',
  'filters.under': 'Under {max}',
  'filters.between': '{min} to {max}',
  'filters.andOver': '{min} and over',
  'filters.from': 'From {min}',
  'filters.upTo': 'Up to {max}',
  'filters.ownRange': 'Or set your own range',
  'filters.min': 'Min ({symbol})',
  'filters.max': 'Max ({symbol})',
  'filters.any': 'Any',
  'filters.all': 'All',
  'filters.selected': '{count} selected',
  'filters.apply': 'Apply',
  'filters.clearAll': 'Clear all filters',
  'filters.clear': 'Clear all',
  'filters.activeList': 'Active filters',
  'filters.remove': ', remove this filter',

  // Basket
  'basket.title': 'Ctrl-Alt-Elite | Basket',
  'basket.description': 'Review the items in your basket.',
  'basket.heading': 'Your basket',
  'basket.empty': 'Your basket is empty.',
  'basket.browse': 'Browse products',
  'basket.caption': 'Items in your basket',
  'basket.product': 'Product',
  'basket.unitPrice': 'Unit price',
  'basket.quantity': 'Quantity',
  'basket.lineTotal': 'Line total',
  'basket.actions': 'Actions',
  'basket.decrease': 'Decrease quantity of {name}',
  'basket.increase': 'Increase quantity of {name}',
  'basket.remove': 'Remove',
  'basket.removeName': 'Remove {name}',
  'basket.total': 'Total ({items}):',
  'basket.checkout': 'Checkout',
  'basket.added': '{name} added to your basket',
  'basket.addedItem': 'Item added to your basket',
  'basket.removed': '{name} removed from your basket',
  'basket.removedItem': 'Item removed from your basket',
  'basket.addFailed': 'Sorry, we could not add that item. Please try again.',
  'basket.updateFailed':
    'Sorry, we could not update your basket. Please try again.',
  'basket.loadFailed':
    "We couldn't load your basket. Please try again in a little while.",
  'basket.reset':
    'We could not find your previous basket, so a new one has been started. Please check your basket before continuing.',
  'basket.notFound': 'Basket not found.',
  'basket.serverError':
    'Something went wrong with your basket. Please try again.',
  'basket.unreachable':
    'We could not reach your basket right now. Please try again later.',
  'checkout.serverError':
    'Something went wrong with checkout. Please try again.',
  'checkout.unreachable':
    'We could not reach checkout right now. Please try again later.',
  'basket.payInPounds':
    'Prices in {currency} are approximate. You will pay in pounds (£) at checkout.',

  // Checkout
  'checkout.title': 'Checkout | Ctrl-Alt-Elite',
  'checkout.errorTitle': 'Error: Checkout | Ctrl-Alt-Elite',
  'checkout.description':
    'Enter your details, choose delivery and pay for your order.',
  'checkout.heading': 'Checkout',
  'checkout.loginHeading': 'Log in to check out',
  'checkout.loginIntro':
    'Orders are paid from the credit balance on your account, so please log in or create an account first. Your basket will be kept.',
  'checkout.login': 'Log in',
  'checkout.createAccount': 'Create an account',
  'checkout.loginBasket': 'Your basket: {items}, {total}',
  'checkout.problem': 'There is a problem',
  'checkout.error': 'Error:',
  'checkout.optional': '{label} (optional)',
  'checkout.step.details': 'Your details',
  'checkout.detailsChoice': 'Choose your checkout details',
  'checkout.useProfile': 'Use my profile details',
  'checkout.useManual': 'Enter different details',
  'checkout.detailsChoiceHint':
    'Using your profile replaces the fields below with your saved details. Changes here apply to this order only, not your profile.',
  'checkout.profileSelected':
    'Profile details loaded. You can edit them for this order. Complete any missing fields, including town or city.',
  'checkout.manualSelected':
    'Enter or edit details for this order. Existing entries are kept; your profile will not change.',
  'checkout.profileUnavailable':
    'We could not load your profile details. Your entries have been kept. Enter your details manually or try again.',
  'checkout.step.delivery': 'Delivery',
  'checkout.step.payment': 'Payment',
  'checkout.firstName': 'First name',
  'checkout.lastName': 'Last name',
  'checkout.email': 'Email address',
  'checkout.emailHint': 'For example, name@example.com',
  'checkout.phone': 'Phone number',
  'checkout.phoneHint': 'A UK number, for example 07700 900123',
  'checkout.homeAddress': 'Home address',
  'checkout.addressHint':
    'Enter your postcode and choose Find address, or type your address in below.',
  'checkout.findAddress': 'Find address',
  'checkout.chooseAddress': 'Choose your address',
  'checkout.useAddress': 'Use this address',
  'checkout.error.chooseAddress': 'Choose your address from the list',
  'checkout.postcode': 'Postcode',
  'checkout.addressLine1': 'Address line 1',
  'checkout.addressLine2': 'Address line 2',
  'checkout.town': 'Town or city',
  'checkout.continueDelivery': 'Continue to delivery',
  'checkout.name': 'Name',
  'checkout.phoneShort': 'Phone',
  'checkout.emailShort': 'Email',
  'checkout.address': 'Address',
  'checkout.change': 'Change',
  'checkout.changeDetails': 'your details',
  'checkout.changeDelivery': 'delivery',
  'checkout.howToGet': 'How would you like to get your order?',
  'checkout.homeDelivery': 'Home delivery',
  'checkout.collection': 'Collect from a drop-off point',
  'checkout.continuePayment': 'Continue to payment',
  'checkout.deliveryLabel': 'Delivery',
  'checkout.free': 'Free',
  'checkout.paidFromCredit':
    'Your order will be paid from the credit balance on your account.',
  'checkout.chargedInPounds':
    'Amounts below are in pounds (£), the currency you are charged in.',
  'checkout.creditBalance': 'Credit balance',
  'checkout.items': 'Items',
  'checkout.orderTotal': 'Order total',
  'checkout.balanceAfter': 'Balance after this order',
  'checkout.cannotAfford':
    'Your credit balance is not enough to pay for this order. Remove some items from your basket or choose a cheaper delivery option.',
  'checkout.submit': 'Checkout',
  'checkout.yourBasket': 'Your basket',
  'checkout.itemsLine': 'Items ({items})',
  'checkout.editBasket': 'Edit basket',
  'checkout.postcodeNotFound':
    'We could not find that postcode. Check it and try again.',
  'checkout.postcodeUnavailable':
    'We could not check your postcode right now. Please try again in a moment.',
  'checkout.totalChanged':
    'Your basket or its prices have changed. Check your new order total and press Checkout again.',
  'checkout.notPlaced':
    'Sorry, we could not place your order. You have not been charged. Please try again.',
  'checkout.unconfirmed':
    'We could not confirm whether your order was placed. Please contact support before trying again.',

  // Checkout form errors
  'checkout.error.tooLong': '{label} must be {max} characters or fewer',
  'checkout.error.postcodeMissing': 'Enter your postcode',
  'checkout.error.postcodeInvalid': 'Enter a real UK postcode, like BT1 1AA',
  'checkout.error.firstName': 'Enter your first name',
  'checkout.error.lastName': 'Enter your last name',
  'checkout.error.emailMissing': 'Enter your email address',
  'checkout.error.emailInvalid':
    'Enter an email address in the correct format, like name@example.com',
  'checkout.error.phoneMissing': 'Enter your phone number',
  'checkout.error.phoneInvalid':
    'Enter a UK phone number using only numbers, like 07700 900123',
  'checkout.error.addressLine1':
    'Enter address line 1, usually the house number and street',
  'checkout.error.town': 'Enter your town or city',
  'checkout.error.delivery': 'Choose how you would like to get your order',

  // Delivery options (names come from the backend; these translate them)
  'delivery.standard.name': 'Standard delivery',
  'delivery.standard.description': '3–5 working days',
  'delivery.express.name': 'Express delivery',
  'delivery.express.description': '1–2 working days',
  'delivery.collection.name': 'Collection point',
  'delivery.collection.description': '{miles} miles away',

  // Order confirmation
  'confirmation.title': 'Order confirmed | Ctrl-Alt-Elite',
  'confirmation.description': 'Your order has been placed.',
  'confirmation.heading': 'Order confirmed',
  'confirmation.thanks': 'Thank you! You have successfully made an order.',
  'confirmation.thanksName':
    'Thank you, {name}! You have successfully made an order.',
  'confirmation.orderNumber': 'Order number',
  'confirmation.placedOn': 'Placed on {date}.',
  'confirmation.yourOrder': 'Your order',
  'confirmation.caption': 'Items in your order',
  'confirmation.paidFromCredit': 'Paid from credit',
  'confirmation.remainingCredit': 'Remaining credit balance',
  'confirmation.deliveryDetails': 'Delivery details',
  'confirmation.continue': 'Continue shopping',

  // Login
  'login.title': 'Log in | Ctrl-Alt-Elite',
  'login.description': 'Log in to your Ctrl-Alt-Elite account.',
  'login.eyebrow': 'Welcome back',
  'login.heading': 'Log in',
  'login.subheading': 'Please enter your details',
  'login.email': 'Email address',
  'login.password': 'Password',
  'login.submit': 'Log in',
  'login.error.form': 'Please submit the login form.',
  'login.error.missing': 'Please enter your email and password.',
  'login.error.unreachable':
    'Unable to reach the server. Please try again later.',
  'login.error.role':
    'Your account role is not recognised. Please contact support.',
  'login.error.confirm': 'Unable to confirm your login. Please try again.',
  'login.error.incorrect': 'Incorrect email or password.',
  'login.error.failed': 'Unable to log in. Please try again later.',

  // Register
  'register.title': 'Ctrl-Alt-Elite | Register',
  'register.description': 'Create your Ctrl-Alt-Elite account.',
  'register.eyebrow': 'Join Ctrl-Alt-Elite',
  'register.heading': 'Create your account',
  'register.subheading': 'Please enter your details',
  'register.firstName': 'First name',
  'register.lastName': 'Last name',
  'register.email': 'Email address',
  'register.password': 'Password',
  'register.confirmPassword': 'Confirm password',
  'register.submit': 'Register',

  // Profile
  'profile.title': 'My Profile | Ctrl-Alt-Elite',
  'profile.description': 'Personalise your Ctrl-Alt-Elite profile.',
  'profile.eyebrow': 'Your account',
  'profile.heading': 'My Profile',
  'profile.intro': 'A little about you. Make your profile feel like your own.',
  'profile.login': 'Log in',
  'profile.current': 'Current profile',
  'profile.pictureAlt': 'Your profile picture',
  'profile.personalSpace': 'Your personal space on Ctrl-Alt-Elite.',
  'profile.credit': 'Credit balance',
  'profile.creditUnavailable':
    'Your credit balance is not available right now.',
  'profile.details': 'Profile details',
  'profile.detailsIntro': 'The details that make you, you.',
  'profile.picture': 'Profile picture',
  'profile.pictureHint':
    'Choose a JPG, PNG or WebP image, up to 20 MiB and 16 megapixels. Your picture is saved separately from your details.',
  'profile.upload': 'Upload picture',
  'profile.removePicture': 'Remove picture',
  'profile.noScript':
    'Enable JavaScript to upload or remove your picture. Your details can still be saved below.',
  'profile.fieldsLegend': 'Your profile details',
  'profile.username': 'Username',
  'profile.usernamePlaceholder': 'Your username',
  'profile.usernameHint':
    'Display name only, not a login. Leave blank to use your first and last name.',
  'profile.firstName': 'First name',
  'profile.firstNamePlaceholder': 'Your first name',
  'profile.lastName': 'Second name',
  'profile.lastNamePlaceholder': 'Your second name',
  'profile.email': 'Email address',
  'profile.emailHint': 'Your login email cannot be changed here.',
  'profile.phone': 'Phone number',
  'profile.phonePlaceholder': 'Your phone number',
  'profile.addressLine1': 'Address line 1',
  'profile.addressLine2': 'Address line 2',
  'profile.postcode': 'Postcode',
  'profile.town': 'Town or city',
  'profile.townPending':
    'Saving town or city on your profile is not available yet. You can still enter it at checkout.',
  'profile.postcodePlaceholder': 'Your postcode',
  'profile.saveHint':
    'First and last names are required. Address, phone and display name are optional.',
  'profile.save': 'Save changes',
  'profile.saved': 'Your profile has been saved.',
  'profile.signInAgain': 'Sign in again to load and save your profile.',
  'profile.error.form': 'Please submit the profile form.',

  // Support
  'support.title': '{title} | Support | Ctrl-Alt-Elite',
  'support.description':
    'Create and manage your Ctrl-Alt-Elite support tickets.',
  'support.eyebrow': 'Support',
  'support.myTickets': 'My tickets',
  'support.logout': 'Log out',
  'support.create': 'Create ticket',
  'support.back': 'Back to my tickets',
  'support.page.list': 'My support tickets',
  'support.page.new': 'Create a ticket',
  'support.page.detail': 'Ticket details',
  'support.newHeading': 'Tell us what went wrong',
  'support.subject': 'Subject',
  'support.category': 'Issue category',
  'support.chooseCategory': 'Select a category',
  'support.ticketDescription': 'Description',
  'support.submit': 'Submit ticket',

  // Error and status pages
  'error.eyebrow': 'Error {status}',
  'error.404.title': 'Page not found',
  'error.404.message':
    'Sorry, we could not find that page. It may have been moved or removed.',
  'error.503.title': 'Service temporarily unavailable',
  'error.503.message':
    'Sorry, this part of the website is unavailable right now. Please try again in a little while.',
  'error.default.title': 'Something went wrong',
  'error.default.message':
    'Sorry, we could not load this page. Please try again in a little while.',
  'unavailable.title': 'Ctrl-Alt-Elite | Unavailable',
  'unavailable.eyebrow': 'Page unavailable',
  'unavailable.heading': 'Website temporarily unavailable',
  'unavailable.message':
    'Sorry, we can’t load the home page right now. Please try again in a little while.',
  'unavailable.retry': 'Try the home page again',
  'accessDenied.title': 'Access denied | Ctrl-Alt-Elite',
  'accessDenied.heading': 'Access denied',
  'accessDenied.home': 'Return to the homepage',

  // Product categories
  'category.Accessories': 'Accessories',
  'category.Bags': 'Bags',
  'category.Dresses': 'Dresses',
  'category.Footwear': 'Footwear',
  'category.Home': 'Home',
  'category.Hoodie': 'Hoodie',
  'category.Jackets': 'Jackets',
  'category.Jeans': 'Jeans',
  'category.Nightwear': 'Nightwear',
  'category.Shirt': 'Shirt',
  'category.Shorts': 'Shorts',
  'category.Skirts': 'Skirts',
  'category.T-Shirt': 'T-Shirt',
  'category.Trousers': 'Trousers',
  'category.Uncategorised': 'Uncategorised',

  // Support ticket categories and statuses (shared with staff pages)
  'js.ticketCategory.ACCOUNT_ISSUE': 'Account Issue',
  'js.ticketCategory.ORDER_ISSUE': 'Order Issue',
  'js.ticketCategory.DELIVERY_ISSUE': 'Delivery Issue',
  'js.ticketCategory.RETURNS_REFUNDS': 'Returns & Refunds',
  'js.ticketCategory.PRODUCT_ENQUIRY': 'Product Enquiry',
  'js.ticketCategory.OTHER': 'Other',

  // Browser scripts
  'js.password.show': 'Show password',
  'js.password.hide': 'Hide password',
  'js.register.invalidEmail': 'Please enter a valid email address.',
  'js.register.creating': 'Creating your account...',
  'js.register.failed': 'Unable to create your account. Please try again.',
  'js.register.created': 'Account created successfully.',
  'js.register.unreachable':
    'Unable to reach the server. Please try again later.',
  'js.register.weakPassword':
    'Use at least 8 characters, including a digit and one of: @, £, $, %, &.',
  'js.register.mismatch': 'Passwords do not match.',
  'js.photo.alt': 'Your profile picture',
  'js.photo.previewAlt': 'Preview of your selected profile picture',
  'js.photo.cannotDisplay':
    'Unable to display this picture. Choose another image or reload the page.',
  'js.photo.cannotDisplaySaved':
    'Unable to display your saved picture. Reload the page to retry.',
  'js.photo.wrongType': 'Choose a JPG, PNG or WebP picture.',
  'js.photo.tooLarge': 'Choose a nonempty picture no larger than 20 MiB.',
  'js.photo.previewOnly': 'Preview only. Select Upload picture to save it.',
  'js.photo.uploading': 'Uploading picture...',
  'js.photo.removing': 'Removing picture...',
  'js.photo.failed': 'Unable to change your picture. Please try again.',
  'js.photo.saved': 'Your picture has been saved.',
  'js.photo.removed': 'Your picture has been removed.',
  'js.support.loadingTickets': 'Loading your tickets…',
  'js.support.loadingTicket': 'Loading ticket…',
  'js.support.listFailedTitle': 'Unable to load your tickets',
  'js.support.listFailed':
    'Something went wrong while loading your tickets. Please try again.',
  'js.support.notFoundTitle': 'Ticket not found',
  'js.support.notFound': 'We could not find a ticket with that ID.',
  'js.support.detailFailedTitle': 'Unable to load this ticket',
  'js.support.detailFailed':
    'Something went wrong while loading this ticket. Please try again.',
} as const;

export type MessageKey = keyof typeof en;

export default en;
