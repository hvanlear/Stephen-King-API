const URL = process.env.URL || 'http://localhost:3001';

export const createResponse = (item) => ({
  ...item,
  villains: item.villains.map((villain) => ({
    name: villain.villain.name,
    url: `${URL}/api/villain/${villain.villainId}`,
  })),
});
