from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class EmploymentRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    # mergeResult is the full AI merge output — shape is open during migration
    mergeResult: dict
    # certificateWorkHistory comes from certificateData.work_history
    certificateWorkHistory: list[dict] | None = None


class EmploymentResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    employmentResult: dict
