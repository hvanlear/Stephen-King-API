const URL = process.env.URL || 'http://localhost:3001';

export const createResponse = (item) => {
    if (item.villains) {
      return {
        ...item,
        villains: item.villains.map((villain) => ({
          name: villain.villain.name,
          url: `${URL}/api/villain/${villain.villainId}`,
        })),
      };
    } else if (item.books && item.shorts) {
        //mapping for the books an shorts attached to the villains
      return {
        ...item,
        books: item.books.map((book) => ({
            title: book.book.Title,
            url: `${URL}/api/book/${book.bookId}`,
        })),
        shorts: item.shorts.map((short) => ({
            title: short.short.title,
            url: `${URL}/api/book/${short.shortId}`,
        })),
      };
    }
  };