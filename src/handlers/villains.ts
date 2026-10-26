import { Request, Response } from "express";
import { villains } from "../catalog";
import { villainResponse } from "../utils/responseHelper";
import { listResponse } from "../utils/pagination";

// The catalog never changes while the server runs, so build responses once
const responses = villains.map(villainResponse);
const responsesById = new Map(responses.map((villain) => [villain.id, villain]));

export const getOneVillain = (req: Request, res: Response) => {
  const villain = responsesById.get(Number(req.params.id));
  if (!villain) {
    return res.status(404).json({ error: "Villain not found" });
  }
  res.json({ data: villain });
};

export const getVillains = (req: Request, res: Response) => {
  res.json(listResponse(responses, req.query));
};
