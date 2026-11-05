/* Irish (Gaeilge) translations of en.ts. Missing keys fall back to English. */
const ga: Partial<Record<string, string>> = {
  // Every page
  'site.name': 'Ctrl-Alt-Elite',
  'site.home': 'Leathanach baile Ctrl-Alt-Elite',
  'site.skipToContent': 'Léim go dtí an príomhábhar',
  'site.mainNavigation': 'Príomhnascleanúint',
  'site.copyright': '© {year} Ctrl-Alt-Elite',
  'site.backToHome': 'Ar ais chuig an leathanach baile',
  'site.home.link': 'Baile',

  // Floating accessibility, language and currency menu
  'preferences.button': 'Inrochtaineacht, teanga agus airgeadra',
  'preferences.heading': 'Inrochtaineacht',
  'preferences.label': 'Teanga agus airgeadra',
  'preferences.language': 'Teanga',
  'preferences.currency': 'Airgeadra',
  'preferences.position': 'Suíomh an chnaipe',
  'preferences.position.bottom-right': 'Thíos ar dheis',
  'preferences.position.bottom-left': 'Thíos ar chlé',
  'preferences.position.top-right': 'Thuas ar dheis',
  'preferences.position.top-left': 'Thuas ar chlé',
  'preferences.apply': 'Sábháil',
  'preferences.close': 'Dún',
  'preferences.dragHint':
    'Is féidir leat an cnaipe seo a tharraingt go cúinne eile freisin.',
  'preferences.approxNote':
    'Níl sna praghsanna san airgeadra {currency} ach meastacháin. Íocann tú i bpuint (£) i gcónaí.',

  // Header
  'header.basketShort': 'Ciseán',
  'header.basket.one': 'Ciseán, {count} earra',
  'header.basket.two': 'Ciseán, {count} earra',
  'header.basket.few': 'Ciseán, {count} earra',
  'header.basket.many': 'Ciseán, {count} n-earra',
  'header.basket.other': 'Ciseán, {count} earra',
  'account.label': 'Cuntas',
  'account.options': 'Roghanna {name}',
  'account.profile': 'Mo Phróifíl',
  'account.dashboard': 'Deais',
  'account.logout': 'Logáil amach',
  'account.login': 'Logáil isteach',
  'account.register': 'Cláraigh',
  'account.support': 'Tacaíocht',
  'account.profileError':
    'Níorbh fhéidir sonraí sábháilte na próifíle a lódáil. Oscail do phróifíl chun triail eile a bhaint as.',
  'search.label': 'Cuardaigh táirgí',
  'search.placeholder': 'Cuardaigh táirgí',
  'search.button': 'Cuardaigh',

  // Counts
  'count.items.one': '{count} earra',
  'count.items.two': '{count} earra',
  'count.items.few': '{count} earra',
  'count.items.many': '{count} n-earra',
  'count.items.other': '{count} earra',
  'count.products.one': '{count} táirge',
  'count.products.two': '{count} tháirge',
  'count.products.few': '{count} tháirge',
  'count.products.many': '{count} dtáirge',
  'count.products.other': '{count} táirge',

  // Homepage
  'home.title': 'Ctrl-Alt-Elite | Baile',
  'home.description':
    'Fáilte go Ctrl-Alt-Elite. Logáil isteach nó brabhsáil na táirgí.',
  'home.eyebrow': 'Fáilte go Ctrl-Alt-Elite',
  'home.heading': 'Aimsigh do rogha nua.',
  'home.intro':
    'Taiscéal ár mbailiúchán agus aimsigh rud éigin a oireann do do shaol laethúil.',
  'home.browse': 'Brabhsáil Táirgí',
  'home.conveyor': 'Siopáil ár réimse',
  'home.featured': 'Táirgí roghnaithe',

  // Product cards and pages
  'product.viewDetails': 'Féach ar na sonraí',
  'product.viewDetailsOf': 'Féach ar shonraí {name}',
  'product.addToBasket': 'Cuir sa Chiseán',
  'product.inStock': 'I Stoc',
  'product.outOfStock': 'As Stoc',
  'product.stockCount': '{count} i stoc',
  'product.stockOut': 'As stoc',
  'product.stockUnknown': 'Níl eolas faoin stoc ar fáil',
  'product.browseAll': 'Brabhsáil na táirgí go léir',
  'product.detailDescription': '{name} ag Ctrl-Alt-Elite.',

  // Product catalogue
  'catalogue.title': 'Catalóg táirgí | Ctrl-Alt-Elite',
  'catalogue.description': 'Brabhsáil catalóg táirgí Ctrl-Alt-Elite.',
  'catalogue.eyebrow': 'Siopa',
  'catalogue.heading': 'Catalóg táirgí',
  'catalogue.intro': 'Brabhsáil na táirgí is déanaí ó Ctrl-Alt-Elite.',
  'catalogue.products': 'Táirgí',
  'catalogue.empty': 'Níl aon táirgí le taispeáint faoi láthair.',
  'catalogue.unavailable': 'Níl na táirgí ar fáil go sealadach.',
  'catalogue.noMatches':
    'Níl aon táirgí a mheaitseálann do scagairí. Bain scagaire nó roghnaigh Glan gach rud.',
  'catalogue.showing': '{count} as {total} á dtaispeáint',
  'catalogue.goHome': 'Téigh abhaile',

  // Search
  'search.title': 'Ctrl-Alt-Elite | Cuardach',
  'search.description':
    'Cuardaigh táirgí Ctrl-Alt-Elite de réir ainm nó catagóire.',
  'search.heading': 'Torthaí cuardaigh',
  'search.prompt': 'Cuir isteach ainm táirge nó eochairfhocal le cuardach.',
  'search.none':
    'Níor aimsíodh aon táirgí le haghaidh "{term}". Bain triail as ainm nó eochairfhocal eile.',
  'search.noFilterMatches':
    'Níl aon táirgí a mheaitseálann do scagairí le haghaidh "{term}". Bain scagaire nó roghnaigh Glan gach rud.',
  'search.found.one': 'Fuarthas {count} táirge le haghaidh "{term}".',
  'search.found.two': 'Fuarthas {count} tháirge le haghaidh "{term}".',
  'search.found.few': 'Fuarthas {count} tháirge le haghaidh "{term}".',
  'search.found.many': 'Fuarthas {count} dtáirge le haghaidh "{term}".',
  'search.found.other': 'Fuarthas {count} táirge le haghaidh "{term}".',
  'search.showing': '{count} as {total} á dtaispeáint le haghaidh "{term}".',
  'search.closest.one':
    'Níl aon toradh beacht le haghaidh "{term}". An toradh is gaire á thaispeáint.',
  'search.closest.two':
    'Níl aon toradh beacht le haghaidh "{term}". Na torthaí is gaire á dtaispeáint.',
  'search.closest.few':
    'Níl aon toradh beacht le haghaidh "{term}". Na torthaí is gaire á dtaispeáint.',
  'search.closest.many':
    'Níl aon toradh beacht le haghaidh "{term}". Na torthaí is gaire á dtaispeáint.',
  'search.closest.other':
    'Níl aon toradh beacht le haghaidh "{term}". Na torthaí is gaire á dtaispeáint.',
  'search.unavailable':
    'Níl an cuardach ar fáil faoi láthair. Bain triail eile as ar ball.',

  // Filter and sort
  'filters.toggle': 'Scag agus sórtáil',
  'filters.active.one': '{count} scagaire i bhfeidhm',
  'filters.active.two': '{count} scagaire i bhfeidhm',
  'filters.active.few': '{count} scagaire i bhfeidhm',
  'filters.active.many': '{count} scagaire i bhfeidhm',
  'filters.active.other': '{count} scagaire i bhfeidhm',
  'filters.sortedBy': 'sórtáilte de réir {sort}',
  'filters.sortBy': 'Sórtáil de réir',
  'filters.sort.recommended': 'Molta',
  'filters.sort.price-asc': 'Praghas: íseal go hard',
  'filters.sort.price-desc': 'Praghas: ard go híseal',
  'filters.sort.newest': 'Is nuaí ar dtús',
  'filters.sort.oldest': 'Is sine ar dtús',
  'filters.sort.most-bought': 'Is mó a ceannaíodh',
  'filters.sort.name-asc': 'Ainm: A go Z',
  'filters.sort.name-desc': 'Ainm: Z go A',
  'filters.availability': 'Infhaighteacht',
  'filters.inStock': 'I stoc',
  'filters.outOfStock': 'As stoc',
  'filters.category': 'Catagóir',
  'filters.price': 'Praghas',
  'filters.anyPrice': 'Praghas ar bith',
  'filters.under': 'Faoi {max}',
  'filters.between': '{min} go {max}',
  'filters.andOver': '{min} agus os a chionn',
  'filters.from': 'Ó {min}',
  'filters.upTo': 'Suas le {max}',
  'filters.ownRange': 'Nó socraigh do raon féin',
  'filters.min': 'Íos ({symbol})',
  'filters.max': 'Uas ({symbol})',
  'filters.any': 'Ar bith',
  'filters.all': 'Gach ceann',
  'filters.selected': '{count} roghnaithe',
  'filters.apply': 'Cuir i bhfeidhm',
  'filters.clearAll': 'Glan na scagairí go léir',
  'filters.clear': 'Glan gach rud',
  'filters.activeList': 'Scagairí i bhfeidhm',
  'filters.remove': ', bain an scagaire seo',

  // Basket
  'basket.title': 'Ctrl-Alt-Elite | Ciseán',
  'basket.description': 'Athbhreithnigh na hearraí i do chiseán.',
  'basket.heading': 'Do chiseán',
  'basket.empty': 'Tá do chiseán folamh.',
  'basket.browse': 'Brabhsáil táirgí',
  'basket.backToProducts': 'Ar ais chuig na táirgí',
  'basket.caption': 'Earraí i do chiseán',
  'basket.product': 'Táirge',
  'basket.unitPrice': 'Praghas aonaid',
  'basket.quantity': 'Cainníocht',
  'basket.lineTotal': 'Iomlán na líne',
  'basket.actions': 'Gníomhartha',
  'basket.decrease': 'Laghdaigh cainníocht {name}',
  'basket.increase': 'Méadaigh cainníocht {name}',
  'basket.remove': 'Bain',
  'basket.removeName': 'Bain {name}',
  'basket.total': 'Iomlán ({items}):',
  'basket.checkout': 'Seiceáil amach',
  'basket.added': 'Cuireadh {name} le do chiseán',
  'basket.addedItem': 'Cuireadh earra le do chiseán',
  'basket.removed': 'Baineadh {name} de do chiseán',
  'basket.removedItem': 'Baineadh earra de do chiseán',
  'basket.addFailed':
    'Ár leithscéal, níorbh fhéidir linn an t-earra sin a chur leis. Bain triail eile as.',
  'basket.updateFailed':
    'Ár leithscéal, níorbh fhéidir linn do chiseán a nuashonrú. Bain triail eile as.',
  'basket.loadFailed':
    'Níorbh fhéidir linn do chiseán a lódáil. Bain triail eile as ar ball.',
  'basket.reset':
    'Níorbh fhéidir linn do chiseán roimhe seo a aimsiú, mar sin tosaíodh ceann nua. Seiceáil do chiseán sula leanann tú ar aghaidh.',
  'basket.notFound': 'Níor aimsíodh an ciseán.',
  'basket.serverError': 'Tharla earráid le do chiseán. Bain triail eile as.',
  'basket.unreachable':
    'Níorbh fhéidir linn teacht ar do chiseán faoi láthair. Bain triail eile as níos déanaí.',
  'checkout.serverError':
    'Tharla earráid leis an tseiceáil amach. Bain triail eile as.',
  'checkout.unreachable':
    'Níorbh fhéidir linn teacht ar an tseiceáil amach faoi láthair. Bain triail eile as níos déanaí.',
  'basket.payInPounds':
    'Níl sna praghsanna san airgeadra {currency} ach meastacháin. Íocfaidh tú i bpuint (£) ag an tseiceáil amach.',

  // Checkout
  'checkout.title': 'Seiceáil amach | Ctrl-Alt-Elite',
  'checkout.errorTitle': 'Earráid: Seiceáil amach | Ctrl-Alt-Elite',
  'checkout.description':
    "Cuir isteach do shonraí, roghnaigh seachadadh agus íoc as d'ordú.",
  'checkout.heading': 'Seiceáil amach',
  'checkout.loginHeading': 'Logáil isteach chun seiceáil amach',
  'checkout.loginIntro':
    'Íoctar orduithe as an iarmhéid creidmheasa ar do chuntas, mar sin logáil isteach nó cruthaigh cuntas ar dtús. Coinneofar do chiseán.',
  'checkout.login': 'Logáil isteach',
  'checkout.createAccount': 'Cruthaigh cuntas',
  'checkout.loginBasket': 'Do chiseán: {items}, {total}',
  'checkout.problem': 'Tá fadhb ann',
  'checkout.error': 'Earráid:',
  'checkout.optional': '{label} (roghnach)',
  'checkout.step.details': 'Do shonraí',
  'checkout.step.delivery': 'Seachadadh',
  'checkout.step.payment': 'Íocaíocht',
  'checkout.firstName': 'Céadainm',
  'checkout.lastName': 'Sloinne',
  'checkout.email': 'Seoladh ríomhphoist',
  'checkout.emailHint': 'Mar shampla, name@example.com',
  'checkout.phone': 'Uimhir ghutháin',
  'checkout.phoneHint': 'Uimhir UK, mar shampla 07700 900123',
  'checkout.homeAddress': 'Seoladh baile',
  'checkout.addressHint':
    'Cuir isteach do sheoladh thíos. Seiceálfaimid go bhfuil do chód poist ann.',
  'checkout.postcode': 'Cód poist',
  'checkout.addressLine1': 'Líne 1 den seoladh',
  'checkout.addressLine2': 'Líne 2 den seoladh',
  'checkout.town': 'Baile nó cathair',
  'checkout.continueDelivery': 'Ar aghaidh chuig an seachadadh',
  'checkout.name': 'Ainm',
  'checkout.phoneShort': 'Fón',
  'checkout.emailShort': 'Ríomhphost',
  'checkout.address': 'Seoladh',
  'checkout.change': 'Athraigh',
  'checkout.changeDetails': 'do shonraí',
  'checkout.changeDelivery': 'an seachadadh',
  'checkout.howToGet': "Conas ba mhaith leat d'ordú a fháil?",
  'checkout.homeDelivery': 'Seachadadh chuig an mbaile',
  'checkout.collection': 'Bailigh ó phointe bailiúcháin',
  'checkout.continuePayment': 'Ar aghaidh chuig an íocaíocht',
  'checkout.deliveryLabel': 'Seachadadh',
  'checkout.free': 'Saor in aisce',
  'checkout.paidFromCredit':
    "Íocfar as d'ordú leis an iarmhéid creidmheasa ar do chuntas.",
  'checkout.chargedInPounds':
    'Tá na méideanna thíos i bpuint (£), an t-airgeadra a ghearrtar ort.',
  'checkout.creditBalance': 'Iarmhéid creidmheasa',
  'checkout.items': 'Earraí',
  'checkout.orderTotal': 'Iomlán an ordaithe',
  'checkout.balanceAfter': 'Iarmhéid tar éis an ordaithe seo',
  'checkout.cannotAfford':
    "Níl d'iarmhéid creidmheasa sách mór chun íoc as an ordú seo. Bain roinnt earraí de do chiseán nó roghnaigh rogha seachadta níos saoire.",
  'checkout.submit': 'Seiceáil amach',
  'checkout.yourBasket': 'Do chiseán',
  'checkout.itemsLine': 'Earraí ({items})',
  'checkout.editBasket': 'Cuir an ciseán in eagar',
  'checkout.postcodeNotFound':
    'Níorbh fhéidir linn an cód poist sin a aimsiú. Seiceáil é agus bain triail eile as.',
  'checkout.postcodeUnavailable':
    'Níorbh fhéidir linn do chód poist a sheiceáil faoi láthair. Bain triail eile as i gceann tamaillín.',
  'checkout.totalChanged':
    "Tá athrú tagtha ar do chiseán nó ar a phraghsanna. Seiceáil iomlán nua d'ordaithe agus brúigh Seiceáil amach arís.",
  'checkout.notPlaced':
    "Ár leithscéal, níorbh fhéidir linn d'ordú a chur isteach. Níor gearradh aon táille ort. Bain triail eile as.",
  'checkout.unconfirmed':
    "Níorbh fhéidir linn a dhearbhú ar cuireadh d'ordú isteach. Déan teagmháil leis an bhfoireann tacaíochta sula mbaineann tú triail eile as.",

  // Checkout form errors
  'checkout.error.tooLong': '{label}: {max} carachtar ar a mhéad',
  'checkout.error.postcodeMissing': 'Cuir isteach do chód poist',
  'checkout.error.postcodeInvalid':
    'Cuir isteach fíorchód poist UK, mar shampla BT1 1AA',
  'checkout.error.firstName': 'Cuir isteach do chéadainm',
  'checkout.error.lastName': 'Cuir isteach do shloinne',
  'checkout.error.emailMissing': 'Cuir isteach do sheoladh ríomhphoist',
  'checkout.error.emailInvalid':
    'Cuir isteach seoladh ríomhphoist san fhormáid cheart, mar shampla name@example.com',
  'checkout.error.phoneMissing': "Cuir isteach d'uimhir ghutháin",
  'checkout.error.phoneInvalid':
    'Cuir isteach uimhir ghutháin UK le digití amháin, mar shampla 07700 900123',
  'checkout.error.addressLine1':
    'Cuir isteach líne 1 den seoladh, uimhir an tí agus an tsráid de ghnáth',
  'checkout.error.town': 'Cuir isteach do bhaile nó do chathair',
  'checkout.error.delivery': "Roghnaigh conas ba mhaith leat d'ordú a fháil",

  // Delivery options (names come from the backend; these translate them)
  'delivery.standard.name': 'Gnáthsheachadadh',
  'delivery.standard.description': '3–5 lá oibre',
  'delivery.express.name': 'Seachadadh sainluais',
  'delivery.express.description': '1–2 lá oibre',
  'delivery.collection.name': 'Pointe bailiúcháin',
  'delivery.collection.description': '{miles} míle uait',

  // Order confirmation
  'confirmation.title': 'Ordú deimhnithe | Ctrl-Alt-Elite',
  'confirmation.description': "Cuireadh d'ordú isteach.",
  'confirmation.heading': 'Ordú deimhnithe',
  'confirmation.thanks': "Go raibh maith agat! D'éirigh leat ordú a dhéanamh.",
  'confirmation.thanksName':
    "Go raibh maith agat, {name}! D'éirigh leat ordú a dhéanamh.",
  'confirmation.orderNumber': 'Uimhir an ordaithe',
  'confirmation.placedOn': 'Curtha isteach ar {date}.',
  'confirmation.yourOrder': "D'ordú",
  'confirmation.caption': "Earraí i d'ordú",
  'confirmation.paidFromCredit': 'Íoctha as creidmheas',
  'confirmation.remainingCredit': 'Iarmhéid creidmheasa atá fágtha',
  'confirmation.deliveryDetails': 'Sonraí seachadta',
  'confirmation.continue': 'Lean ort ag siopadóireacht',

  // Login
  'login.title': 'Logáil isteach | Ctrl-Alt-Elite',
  'login.description': 'Logáil isteach i do chuntas Ctrl-Alt-Elite.',
  'login.eyebrow': 'Fáilte ar ais',
  'login.heading': 'Logáil isteach',
  'login.subheading': 'Cuir isteach do shonraí',
  'login.email': 'Seoladh ríomhphoist',
  'login.password': 'Pasfhocal',
  'login.submit': 'Logáil isteach',
  'login.error.form': 'Seol isteach an fhoirm logála isteach, le do thoil.',
  'login.error.missing':
    'Cuir isteach do sheoladh ríomhphoist agus do phasfhocal.',
  'login.error.unreachable':
    'Ní féidir teacht ar an bhfreastalaí. Bain triail eile as níos déanaí.',
  'login.error.role':
    'Ní aithnítear ról do chuntais. Déan teagmháil leis an bhfoireann tacaíochta.',
  'login.error.confirm':
    'Ní féidir do logáil isteach a dhearbhú. Bain triail eile as.',
  'login.error.incorrect': 'Seoladh ríomhphoist nó pasfhocal mícheart.',
  'login.error.failed':
    'Ní féidir logáil isteach. Bain triail eile as níos déanaí.',

  // Register
  'register.title': 'Ctrl-Alt-Elite | Cláraigh',
  'register.description': 'Cruthaigh do chuntas Ctrl-Alt-Elite.',
  'register.eyebrow': 'Cláraigh le Ctrl-Alt-Elite',
  'register.heading': 'Cruthaigh do chuntas',
  'register.subheading': 'Cuir isteach do shonraí',
  'register.firstName': 'Céadainm',
  'register.lastName': 'Sloinne',
  'register.email': 'Seoladh ríomhphoist',
  'register.password': 'Pasfhocal',
  'register.confirmPassword': 'Deimhnigh an pasfhocal',
  'register.submit': 'Cláraigh',

  // Profile
  'profile.title': 'Mo Phróifíl | Ctrl-Alt-Elite',
  'profile.description': 'Pearsantaigh do phróifíl Ctrl-Alt-Elite.',
  'profile.eyebrow': 'Do chuntas',
  'profile.heading': 'Mo Phróifíl',
  'profile.intro': 'Beagán fút féin. Cuir do stampa féin ar do phróifíl.',
  'profile.login': 'Logáil isteach',
  'profile.current': 'Próifíl reatha',
  'profile.pictureAlt': 'Do phictiúr próifíle',
  'profile.personalSpace': 'Do spás pearsanta ar Ctrl-Alt-Elite.',
  'profile.credit': 'Iarmhéid creidmheasa',
  'profile.creditUnavailable':
    "Níl d'iarmhéid creidmheasa ar fáil faoi láthair.",
  'profile.details': 'Sonraí próifíle',
  'profile.detailsIntro': 'Na sonraí a fhágann gur tusa thú.',
  'profile.picture': 'Pictiúr próifíle',
  'profile.pictureHint':
    'Roghnaigh íomhá JPG, PNG nó WebP, suas le 20 MiB agus 16 meigiphicteilín. Sábháiltear do phictiúr ar leith ó do shonraí.',
  'profile.upload': 'Uaslódáil pictiúr',
  'profile.removePicture': 'Bain an pictiúr',
  'profile.noScript':
    'Cumasaigh JavaScript chun do phictiúr a uaslódáil nó a bhaint. Is féidir do shonraí a shábháil thíos fós.',
  'profile.fieldsLegend': 'Sonraí do phróifíle',
  'profile.username': 'Ainm úsáideora',
  'profile.usernamePlaceholder': "D'ainm úsáideora",
  'profile.usernameHint':
    'Ainm taispeána amháin, ní le logáil isteach. Fág bán é chun do chéadainm agus do shloinne a úsáid.',
  'profile.firstName': 'Céadainm',
  'profile.firstNamePlaceholder': 'Do chéadainm',
  'profile.lastName': 'Sloinne',
  'profile.lastNamePlaceholder': 'Do shloinne',
  'profile.email': 'Seoladh ríomhphoist',
  'profile.emailHint':
    'Ní féidir do sheoladh ríomhphoist logála isteach a athrú anseo.',
  'profile.phone': 'Uimhir ghutháin',
  'profile.phonePlaceholder': "D'uimhir ghutháin",
  'profile.addressLine1': 'Líne 1 den seoladh',
  'profile.addressLine2': 'Líne 2 den seoladh',
  'profile.postcode': 'Cód poist',
  'profile.postcodePlaceholder': 'Do chód poist',
  'profile.saveHint':
    'Tá an céadainm agus an sloinne riachtanach. Tá an seoladh, an uimhir ghutháin agus an t-ainm taispeána roghnach.',
  'profile.save': 'Sábháil na hathruithe',
  'profile.viewOrders': 'Féach ar orduithe',
  'orders.heading': 'Stair na n-orduithe',
  'orders.description': 'Féach ar d’orduithe roimhe seo ó Ctrl-Alt-Elite.',
  'orders.number': 'Ordú #{id}',
  'orders.product': 'Táirge #{id} - Cainníocht: {amount}',
  'orders.total': 'Iomlán: {total}',
  'orders.empty': 'Níl aon orduithe roimhe seo agat.',
  'orders.unavailable': 'Níl orduithe ar fáil faoi láthair.',
  'profile.saved': 'Sábháladh do phróifíl.',
  'profile.signInAgain':
    'Logáil isteach arís chun do phróifíl a lódáil agus a shábháil.',
  'profile.error.form': 'Seol isteach an fhoirm phróifíle, le do thoil.',

  // Support
  'support.title': '{title} | Tacaíocht | Ctrl-Alt-Elite',
  'support.description':
    'Cruthaigh agus bainistigh do thicéid tacaíochta Ctrl-Alt-Elite.',
  'support.eyebrow': 'Tacaíocht',
  'support.myTickets': 'Mo thicéid',
  'support.logout': 'Logáil amach',
  'support.create': 'Cruthaigh ticéad',
  'support.back': 'Ar ais chuig mo thicéid',
  'support.page.list': 'Mo thicéid tacaíochta',
  'support.page.new': 'Cruthaigh ticéad',
  'support.page.detail': 'Sonraí an ticéid',
  'support.newHeading': 'Inis dúinn cad a chuaigh mícheart',
  'support.subject': 'Ábhar',
  'support.category': 'Catagóir na faidhbe',
  'support.chooseCategory': 'Roghnaigh catagóir',
  'support.ticketDescription': 'Cur síos',
  'support.submit': 'Seol an ticéad',

  // Error and status pages
  'error.eyebrow': 'Earráid {status}',
  'error.404.title': 'Níor aimsíodh an leathanach',
  'error.404.message':
    "Ár leithscéal, níorbh fhéidir linn an leathanach sin a aimsiú. B'fhéidir gur bogadh nó gur baineadh é.",
  'error.503.title': 'Níl an tseirbhís ar fáil go sealadach',
  'error.503.message':
    'Ár leithscéal, níl an chuid seo den suíomh gréasáin ar fáil faoi láthair. Bain triail eile as ar ball.',
  'error.default.title': 'Tharla earráid',
  'error.default.message':
    'Ár leithscéal, níorbh fhéidir linn an leathanach seo a lódáil. Bain triail eile as ar ball.',
  'unavailable.title': 'Ctrl-Alt-Elite | Níl sé ar fáil',
  'unavailable.eyebrow': 'Níl an leathanach ar fáil',
  'unavailable.heading': 'Níl an suíomh gréasáin ar fáil go sealadach',
  'unavailable.message':
    'Ár leithscéal, ní féidir linn an leathanach baile a lódáil faoi láthair. Bain triail eile as ar ball.',
  'unavailable.retry': 'Bain triail eile as an leathanach baile',
  'accessDenied.title': 'Rochtain diúltaithe | Ctrl-Alt-Elite',
  'accessDenied.heading': 'Rochtain diúltaithe',
  'accessDenied.home': 'Fill ar an leathanach baile',

  // Product categories
  'category.Accessories': 'Oiriúintí',
  'category.Bags': 'Málaí',
  'category.Dresses': 'Gúnaí',
  'category.Footwear': 'Coisbheart',
  'category.Home': 'Earraí tí',
  'category.Hoodie': 'Geansaí cochaill',
  'category.Jackets': 'Seaicéid',
  'category.Jeans': 'Jíons',
  'category.Nightwear': 'Éadaí oíche',
  'category.Shirt': 'Léine',
  'category.Shorts': 'Brístí gearra',
  'category.Skirts': 'Sciortaí',
  'category.T-Shirt': 'T-léine',
  'category.Trousers': 'Brístí',
  'category.Uncategorised': 'Gan chatagóir',

  // Support ticket categories and statuses (shared with staff pages)
  'js.ticketCategory.ACCOUNT_ISSUE': 'Fadhb le cuntas',
  'js.ticketCategory.ORDER_ISSUE': 'Fadhb le hordú',
  'js.ticketCategory.DELIVERY_ISSUE': 'Fadhb le seachadadh',
  'js.ticketCategory.RETURNS_REFUNDS': 'Tuairisceáin agus aisíocaíochtaí',
  'js.ticketCategory.PRODUCT_ENQUIRY': 'Fiosrúchán faoi tháirge',
  'js.ticketCategory.OTHER': 'Eile',

  // Browser scripts
  'js.password.show': 'Taispeáin an pasfhocal',
  'js.password.hide': 'Folaigh an pasfhocal',
  'js.register.invalidEmail': 'Cuir isteach seoladh ríomhphoist bailí.',
  'js.register.creating': 'Do chuntas á chruthú...',
  'js.register.failed': 'Ní féidir do chuntas a chruthú. Bain triail eile as.',
  'js.register.created': 'Cruthaíodh an cuntas.',
  'js.register.unreachable':
    'Ní féidir teacht ar an bhfreastalaí. Bain triail eile as níos déanaí.',
  'js.register.weakPassword':
    'Úsáid 8 gcarachtar ar a laghad, lena n-áirítear digit amháin agus ceann amháin díobh seo: @, £, $, %, &.',
  'js.register.mismatch': 'Ní hionann na pasfhocail.',
  'js.photo.alt': 'Do phictiúr próifíle',
  'js.photo.previewAlt': 'Réamhamharc ar an bpictiúr próifíle a roghnaigh tú',
  'js.photo.cannotDisplay':
    'Ní féidir an pictiúr seo a thaispeáint. Roghnaigh íomhá eile nó athlódáil an leathanach.',
  'js.photo.cannotDisplaySaved':
    'Ní féidir do phictiúr sábháilte a thaispeáint. Athlódáil an leathanach chun triail eile a bhaint as.',
  'js.photo.wrongType': 'Roghnaigh pictiúr JPG, PNG nó WebP.',
  'js.photo.tooLarge':
    'Roghnaigh pictiúr nach bhfuil folamh agus nach mó ná 20 MiB.',
  'js.photo.previewOnly':
    'Réamhamharc amháin. Roghnaigh Uaslódáil pictiúr chun é a shábháil.',
  'js.photo.uploading': 'Pictiúr á uaslódáil...',
  'js.photo.removing': 'Pictiúr á bhaint...',
  'js.photo.failed': 'Ní féidir do phictiúr a athrú. Bain triail eile as.',
  'js.photo.saved': 'Sábháladh do phictiúr.',
  'js.photo.removed': 'Baineadh do phictiúr.',
  'js.support.loadingTickets': 'Do thicéid á lódáil…',
  'js.support.loadingTicket': 'Ticéad á lódáil…',
  'js.support.listFailedTitle': 'Ní féidir do thicéid a lódáil',
  'js.support.listFailed':
    'Tharla earráid agus do thicéid á lódáil. Bain triail eile as.',
  'js.support.notFoundTitle': 'Níor aimsíodh an ticéad',
  'js.support.notFound':
    'Níorbh fhéidir linn ticéad leis an aitheantas sin a aimsiú.',
  'js.support.detailFailedTitle': 'Ní féidir an ticéad seo a lódáil',
  'js.support.detailFailed':
    'Tharla earráid agus an ticéad seo á lódáil. Bain triail eile as.',
};

export default ga;
