export const createResponse = (item, URL) => ({
  ...item,
  villains: item.villains.map((villain) => ({
    name: villain.villain.name,
    url: `${URL}/api/villain/${villain.villainId}`,
  })),
});
