// InsTrip mobile — pure guide filtering for the Friends tab.

export function filterGuides(guides, filters = {}) {
  const city = filters.city || 'all';
  const kind = filters.kind || 'all';
  const topic = filters.topic || 'all';
  return guides.filter((guide) => (
    (city === 'all' || guide.citySlug === city)
    && (kind === 'all' || guide.kind === kind)
    && (topic === 'all' || guide.topics.some((value) => value.toLowerCase().includes(topic.toLowerCase())))
  ));
}
