import { Request, Response } from "express";
import { places } from "../catalog";
import { placeResponse } from "../utils/responseHelper";
import { sendList } from "../utils/pagination";
import { parseId } from "../utils/parseId";

// The catalog never changes while the server runs, so build responses once
const responses = places.map(placeResponse);
const responsesById = new Map(responses.map((place) => [place.id, place]));

export const getOnePlace = (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Place id must be a whole number" });
  }
  const place = responsesById.get(id);
  if (!place) {
    return res.status(404).json({ error: "Place not found" });
  }
  res.json({ data: place });
};

export const getPlaces = (req: Request, res: Response) => {
  sendList(res, responses, req.query);
};
