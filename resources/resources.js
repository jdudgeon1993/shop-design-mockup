// The Resource Library: everything a customer, designer or contractor can read, flip through or
// download. Used by /resources/ (the library) and /resources/view/ (the flipbook).
//
// categories: the shelves, in order, each with its series name ("Field Guide" -> "Field Guide No. 01").
//   A category with no items shows under "On the way" (its topics) when soon:true, otherwise hidden.
// items: one per resource.
//   kind 'pdf'  -> pages in resources/docs/<slug>/ (p01.webp..., cover.webp, <slug>.pdf); w/h = page size
//   kind 'link' -> opens href (e.g. a Design Card); cover = any image
//   audience: any of 'homeowners', 'pros' (designers, contractors). featured: shown big at the top.
// Only material Design Lab made itself (no manufacturer catalogs for now), and never a price list:
// this site is public.
window.DL_RESOURCES = {
    // Our three series: Field Guides (brochures), Lab Books (the Curated Collection cards, numbered
    // like the collections) and Lab Notes (company information: care, warranty, measuring, specs).
    categories: [
        { id: 'field-guides', title: 'Field Guides', series: 'Field Guide', blurb: 'Our brochures: ideas, materials and finished spaces to flip through.' },
        { id: 'lab-books', title: 'Lab Books', series: 'Lab Book', blurb: 'Every Curated Collection, with its drawing, specs and notes.' },
        { id: 'lab-notes', title: 'Lab Notes', series: 'Lab Notes', soon: true, blurb: 'The practical side: caring for your cabinets, warranties, measuring and specs.',
          topics: [
              { title: 'Planning & Measuring', blurb: 'How to measure your space and plan your layout.' },
              { title: 'Care & Warranty', blurb: 'Caring for your cabinets, and what each line’s warranty covers.' },
              { title: 'Spec Sheets', blurb: 'Sizes, construction and options for designers and contractors.' }
          ] }
    ],
    items: [
        { slug: 'closet-structure', kind: 'pdf', category: 'field-guides', no: '01', title: 'Closets',
          blurb: 'Walk-in closets, reach-ins and storage by Structure | 3, plus the engineered materials behind them.',
          pages: 13, w: 1105, h: 1430, audience: ['homeowners', 'pros'], tags: ['closet', 'structure 3', 'storage', 'materials'], featured: true },
        { slug: 'card-study-time', kind: 'link', category: 'lab-books', title: 'Study Time', no: '001',
          blurb: 'A built-in desk with two bookcase towers.', href: '/collections/?card=study-time&side=back',
          cover: '/Assets/Images/curated/study-time-front.webp', audience: ['homeowners', 'pros'], tags: ['desk', 'office', 'built-in'] },
        { slug: 'card-laundry-man', kind: 'link', category: 'lab-books', title: 'Laundry Man & the Cat', no: '007',
          blurb: 'A walnut laundry wall with a hanging nook, sink, folding counter and washer-dryer tower.', href: '/collections/?card=laundry-man&side=back',
          cover: '/Assets/Images/curated/laundry-man-front.webp', audience: ['homeowners', 'pros'], tags: ['laundry', 'slab', 'walnut', 'hanging'] },
        { slug: 'card-american-hutch', kind: 'link', category: 'lab-books', title: 'The American Hutch', no: '008',
          blurb: 'A framed shaker hutch and buffet with glass-door uppers.', href: '/collections/?card=american-hutch&side=back',
          cover: '/Assets/Images/curated/american-hutch-front.webp', audience: ['homeowners', 'pros'], tags: ['hutch', 'dining', 'buffet', 'shaker'] },
        { slug: 'card-laundry-is-done', kind: 'link', category: 'lab-books', title: 'Laundry is Done!', no: '009',
          blurb: 'A full laundry wall: sink, folding counter, hanging rod and storage.', href: '/collections/?card=laundry-is-done&side=back',
          cover: '/Assets/Images/curated/laundry-is-done-front.webp', audience: ['homeowners', 'pros'], tags: ['laundry', 'mudroom', 'slab'] },
        { slug: 'card-welcome-home', kind: 'link', category: 'lab-books', title: 'Welcome Home', no: '010',
          blurb: 'A drop zone: two tall cabinets, a bench with hooks, and storage above.', href: '/collections/?card=welcome-home&side=back',
          cover: '/Assets/Images/curated/welcome-home-front.webp', audience: ['homeowners', 'pros'], tags: ['mudroom', 'drop zone', 'entry', 'bench', 'painted'] }
    ],
    dir: function (slug) { return '/resources/docs/' + slug + '/'; },
    page: function (slug, n) { return this.dir(slug) + 'p' + (n < 10 ? '0' : '') + n + '.webp'; },
    pdf: function (slug) { return this.dir(slug) + slug + '.pdf'; },
    cover: function (it) { return it.cover || this.dir(it.slug) + 'cover.webp'; },
    find: function (slug) { return this.items.filter(function (d) { return d.slug === slug; })[0]; },
    // What an item is called: "Field Guide No. 01", "Lab Book No. 008".
    label: function (it) {
        var c = this.categories.filter(function (x) { return x.id === it.category; })[0];
        return (c ? c.series : '') + (it.no ? ' No. ' + it.no : '');
    }
};
// The flipbook (/resources/view/) still reads DL_RESOURCES.find(); keep `docs` as an alias.
window.DL_RESOURCES.docs = window.DL_RESOURCES.items;
