// The Resources library: every customer-facing PDF, used by /resources/ (the shelf) and
// /resources/view/ (the flipbook). To add one: put its pages in resources/docs/<slug>/
// (p01.webp, p02.webp, ... + cover.webp + <slug>.pdf, see the PR for the commands) and add
// an entry here. w/h = the page image size, so the flipbook knows its shape.
// Only PDFs Design Lab made itself (no manufacturer catalogs for now), and never a price list:
// this site is public.
window.DL_RESOURCES = {
    groups: [
        { id: 'design-lab', title: 'Design Lab', blurb: 'Our own lookbooks and brochures.' }
    ],
    docs: [
        { slug: 'closet-structure', group: 'design-lab', title: 'Closet Structure', kind: 'Lookbook',
          blurb: 'Walk-in closets, reach-ins and storage by Structure | 3.', pages: 13, w: 1105, h: 1430 }
    ],
    dir: function (slug) { return '/resources/docs/' + slug + '/'; },
    page: function (slug, n) { return this.dir(slug) + 'p' + (n < 10 ? '0' : '') + n + '.webp'; },
    pdf: function (slug) { return this.dir(slug) + slug + '.pdf'; },
    find: function (slug) { return this.docs.filter(function (d) { return d.slug === slug; })[0]; }
};
