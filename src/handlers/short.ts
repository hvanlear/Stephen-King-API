import { Request, Response } from "express";
import { shorts } from "../catalog";
import { shortResponse } from "../utils/responseHelper";
import { listResponse } from "../utils/pagination";

// The catalog never changes while the server runs, so build responses once
const responses = shorts.map(shortResponse);
const responsesById = new Map(responses.map((short) => [short.id, short]));

//get one short
export const getOneShort = (req: Request, res: Response) => {
  const short = responsesById.get(Number(req.params.id));
  if (!short) {
    return res.status(404).json({ error: "Short not found" });
  }
  res.json({ data: short });
};

//get all shorts
export const getShorts = (req: Request, res: Response) => {
  res.json(listResponse(responses, req.query));
};
