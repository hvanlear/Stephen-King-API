import {
  Book,
  Short,
  Villain,
  Place,
  books,
  shorts,
  villains,
  places,
  villainIdsByBook,
  villainIdsByShort,
  bookIdsByVillain,
  shortIdsByVillain,
  placeIdsByParent,
  bookIdsByPlace,
  shortIdsByPlace,
  villainIdsByPlace,
  placeIdsByBook,
  placeIdsByShort,
  placeIdsByVillain,
} from "../catalog";
import config from "../config";

const URL = config.url;

const villainNames = new Map(villains.map((v) => [v.id, v.name]));
const bookTitles = new Map(books.map((b) => [b.id, b.Title]));
const shortTitles = new Map(shorts.map((s) => [s.id, s.title]));
const placeNames = new Map(places.map((p) => [p.id, p.name]));

const villainLinks = (ids: number[] = []) =>
  ids.map((id) => ({
    name: villainNames.get(id),
    url: `${URL}/api/villain/${id}`,
  }));

const placeLinks = (ids: number[] = []) =>
  ids.map((id) => ({
    name: placeNames.get(id),
    url: `${URL}/api/place/${id}`,
  }));

export const bookResponse = (book: Book) => ({
  ...book,
  villains: villainLinks(villainIdsByBook.get(book.id)),
  places: placeLinks(placeIdsByBook.get(book.id)),
});

export const shortResponse = (short: Short) => ({
  ...short,
  villains: villainLinks(villainIdsByShort.get(short.id)),
  places: placeLinks(placeIdsByShort.get(short.id)),
});

const bookLinks = (ids: number[] = []) =>
  ids.map((id) => ({
    title: bookTitles.get(id),
    url: `${URL}/api/book/${id}`,
  }));

const shortLinks = (ids: number[] = []) =>
  ids.map((id) => ({
    title: shortTitles.get(id),
    url: `${URL}/api/short/${id}`,
  }));

// appears_in and residence hold handles, which are served as links instead
export const villainResponse = ({ appears_in, residence, ...villain }: Villain) => ({
  ...villain,
  books: bookLinks(bookIdsByVillain.get(villain.id)),
  shorts: shortLinks(shortIdsByVillain.get(villain.id)),
  residence: placeLinks(placeIdsByVillain.get(villain.id)),
});

// parentId and appears_in only exist to build the links, so they aren't returned
export const placeResponse = ({ parentId, appears_in, ...place }: Place) => ({
  ...place,
  parent: parentId === null ? null : placeLinks([parentId])[0],
  places: placeLinks(placeIdsByParent.get(place.id)),
  books: bookLinks(bookIdsByPlace.get(place.id)),
  shorts: shortLinks(shortIdsByPlace.get(place.id)),
  villains: villainLinks(villainIdsByPlace.get(place.id)),
});
