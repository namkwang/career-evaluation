from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class PersonalInfoResume(BaseModel):
    model_config = ConfigDict(extra="allow")

    name_korean: str
    name_hanja: str | None = None
    birth_date: str | None = None
    birth_year: int | None = None
    age: int | None = None
    gender: str | None = None
    address: str | None = None
    phone: str | None = None
    email: str | None = None
    photo_present: bool = False


class ApplicationInfo(BaseModel):
    model_config = ConfigDict(extra="allow")

    applied_field: str | None = None
    applied_date: str | None = None
    desired_salary: str | None = None
    previous_salary: int | None = None


class CurrentStatus(BaseModel):
    model_config = ConfigDict(extra="allow")

    current_position: str | None = None
    current_job_function: str | None = None
    current_company: str | None = None
    group_join_date: str | None = None


class SummarySection(BaseModel):
    model_config = ConfigDict(extra="allow")

    total_career_years: str | None = None
    brief_introduction: str | None = None
    key_competencies: str | None = None


class EducationItemResume(BaseModel):
    model_config = ConfigDict(extra="allow")

    graduation_date: str
    admission_date: str | None = None
    school_name: str
    department: str | None = None
    degree: str | None = None
    status: str | None = None
    gpa: str | None = None
    location: str | None = None
    day_night: str | None = None
    thesis: str | None = None


class CertificationItemResume(BaseModel):
    model_config = ConfigDict(extra="allow")

    type_and_grade: str
    pass_date: str
    registration_number: str | None = None
    issuing_body: str | None = None


class MilitaryService(BaseModel):
    model_config = ConfigDict(extra="allow")

    status: str | None = None
    branch: str | None = None
    rank: str | None = None
    specialty: str | None = None
    service_place: str | None = None
    period_start: str | None = None
    period_end: str | None = None


class WorkHistoryItemResume(BaseModel):
    model_config = ConfigDict(extra="allow")

    period_start: str
    period_end: str | None = None
    company_name: str
    company_name_current: str | None = None
    department: str | None = None
    position: str | None = None
    role: str | None = None
    job_category: str | None = None
    salary: int | None = None
    work_region: str | None = None
    resignation_reason: str | None = None
    is_current: bool = False
    employment_type: str
    employment_type_signals: str | None = None


class CareerItemResume(BaseModel):
    model_config = ConfigDict(extra="allow")

    project_name: str | None = None
    period_start: str
    period_end: str | None = None
    period_is_company_level: bool = False
    duration_text: str | None = None
    company_name: str
    position: str | None = None
    role: str | None = None
    task_type: str | None = None
    task_description: str | None = None
    client: str | None = None
    construction_type: str | None = None
    project_overview: str | None = None
    project_amount: int | None = None
    construction_method: str | None = None
    participation_scope: str | None = None
    is_headquarters: bool = False
    is_non_construction: bool = False
    employment_type: str
    employment_type_signals: str | None = None


class AchievementItem(BaseModel):
    model_config = ConfigDict(extra="allow")

    career_index: int | None = None
    company_name: str
    description: str
    quantitative_value: str | None = None


class SelfIntroSection(BaseModel):
    model_config = ConfigDict(extra="allow")

    title: str | None = None
    content: str


class SelfIntroduction(BaseModel):
    model_config = ConfigDict(extra="allow")

    full_text: str | None = None
    sections: list[SelfIntroSection] = []


class ActivityItem(BaseModel):
    model_config = ConfigDict(extra="allow")

    period: str | None = None
    description: str


class FamilyItem(BaseModel):
    model_config = ConfigDict(extra="allow")

    relation: str
    name: str | None = None
    age: int | None = None
    occupation: str | None = None


class PhysicalInfo(BaseModel):
    model_config = ConfigDict(extra="allow")

    height: str | None = None
    weight: str | None = None
    vision: str | None = None


class ResumeExtraction(BaseModel):
    model_config = ConfigDict(extra="allow")

    resume_format_type: str
    personal_info: PersonalInfoResume
    application_info: ApplicationInfo
    current_status: CurrentStatus
    summary: SummarySection
    skills: list[str] = []
    education: list[EducationItemResume] = []
    certifications: list[CertificationItemResume] = []
    military_service: MilitaryService
    work_history: list[WorkHistoryItemResume] = []
    careers: list[CareerItemResume] = []
    achievements: list[AchievementItem] = []
    self_introduction: SelfIntroduction
    activities: list[ActivityItem] = []
    family: list[FamilyItem] = []
    physical_info: PhysicalInfo
    attachments_mentioned: list[str] = []


# --- CertificateExtraction ---

class DocumentInfo(BaseModel):
    model_config = ConfigDict(extra="allow")

    document_confirmation_number: str
    management_number: str
    issue_number: str
    issue_date: str
    total_pages: int


class PersonalInfoCert(BaseModel):
    model_config = ConfigDict(extra="allow")

    name_korean: str
    name_hanja: str | None = None
    birth_date: str
    address: str


class GradeField(BaseModel):
    model_config = ConfigDict(extra="allow")

    job_field: str | None = None
    specialty_field: str | None = None


class Grade(BaseModel):
    model_config = ConfigDict(extra="allow")

    design_construction: GradeField
    construction_project_management: GradeField
    quality_management: str | None = None


class CertificationItemCert(BaseModel):
    model_config = ConfigDict(extra="allow")

    type_and_grade: str
    pass_date: str
    registration_number: str


class EducationItemCert(BaseModel):
    model_config = ConfigDict(extra="allow")

    graduation_date: str
    school_name: str
    department: str
    degree: str


class WorkHistoryItemCert(BaseModel):
    model_config = ConfigDict(extra="allow")

    period_start: str
    period_end: str | None = None
    company_name: str
    company_name_current: str | None = None


class TechnicalCareerItem(BaseModel):
    model_config = ConfigDict(extra="allow")

    company_name: str
    project_name: str
    period_start: str
    period_end: str
    recognized_days: int
    client: str
    construction_type: str
    job_field: str
    specialty_field: str | None = None
    task_type: str
    position: str
    position_raw: str
    responsibility_level: str | None = None
    project_amount: int | None = None
    construction_method: str | None = None
    project_overview: str | None = None


class CareerSummaryByType(BaseModel):
    model_config = ConfigDict(extra="allow")

    type: str
    recognized_days: int


class CareerSummaryByField(BaseModel):
    model_config = ConfigDict(extra="allow")

    job_field: str
    specialty_field: str
    recognized_days: int


class CareerSummary(BaseModel):
    model_config = ConfigDict(extra="allow")

    by_construction_type: list[CareerSummaryByType] = []
    by_job_specialty: list[CareerSummaryByField] = []
    total_recognized_days_by_type: int = 0
    total_recognized_days_by_field: int = 0


class CertificateExtraction(BaseModel):
    model_config = ConfigDict(extra="allow")

    document_info: DocumentInfo
    personal_info: PersonalInfoCert
    grade: Grade
    certifications: list[CertificationItemCert] = []
    education: list[EducationItemCert] = []
    work_history: list[WorkHistoryItemCert] = []
    technical_career: list[TechnicalCareerItem] = []
    career_summary: CareerSummary


class ExtractionResult(BaseModel):
    model_config = ConfigDict(extra="allow")

    # camelCase keys preserved — wire format from the TS frontend uses camelCase here
    resumeData: ResumeExtraction
    certificateData: CertificateExtraction | None = None
