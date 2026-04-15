// Step 1-B: 이력서 추출 결과
export interface ResumeExtraction {
  resume_format_type: string;
  personal_info: {
    name_korean: string;
    name_hanja: string | null;
    birth_date: string | null;
    birth_year: number | null;
    age: number | null;
    gender: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    photo_present: boolean;
  };
  application_info: {
    applied_field: string | null;
    applied_date: string | null;
    desired_salary: string | null;
    previous_salary: number | null;
  };
  current_status: {
    current_position: string | null;
    current_job_function: string | null;
    current_company: string | null;
    group_join_date: string | null;
  };
  summary: {
    total_career_years: string | null;
    brief_introduction: string | null;
    key_competencies: string | null;
  };
  skills: string[];
  education: Array<{
    graduation_date: string;
    admission_date: string | null;
    school_name: string;
    department: string | null;
    degree: string | null;
    status: string | null;
    gpa: string | null;
    location: string | null;
    day_night: string | null;
    thesis: string | null;
  }>;
  certifications: Array<{
    type_and_grade: string;
    pass_date: string;
    registration_number: string | null;
    issuing_body: string | null;
  }>;
  military_service: {
    status: string | null;
    branch: string | null;
    rank: string | null;
    specialty: string | null;
    service_place: string | null;
    period_start: string | null;
    period_end: string | null;
  };
  work_history: Array<{
    period_start: string;
    period_end: string | null;
    company_name: string;
    company_name_current: string | null;
    department: string | null;
    position: string | null;
    role: string | null;
    job_category: string | null;
    salary: number | null;
    work_region: string | null;
    resignation_reason: string | null;
    is_current: boolean;
    employment_type: string;
    employment_type_signals: string | null;
  }>;
  careers: Array<{
    project_name: string | null;
    period_start: string;
    period_end: string | null;
    period_is_company_level: boolean;
    duration_text: string | null;
    company_name: string;
    position: string | null;
    role: string | null;
    task_type: string | null;
    task_description: string | null;
    client: string | null;
    construction_type: string | null;
    project_overview: string | null;
    project_amount: number | null;
    construction_method: string | null;
    participation_scope: string | null;
    is_headquarters: boolean;
    is_non_construction: boolean;
    employment_type: string;
    employment_type_signals: string | null;
  }>;
  achievements: Array<{
    career_index: number | null;
    company_name: string;
    description: string;
    quantitative_value: string | null;
  }>;
  self_introduction: {
    full_text: string | null;
    sections: Array<{ title: string | null; content: string }>;
  };
  activities: Array<{ period: string | null; description: string }>;
  family: Array<{
    relation: string;
    name: string | null;
    age: number | null;
    occupation: string | null;
  }>;
  physical_info: {
    height: string | null;
    weight: string | null;
    vision: string | null;
  };
  attachments_mentioned: string[];
}

// Step 1-A: 경력증명서 추출 결과
export interface CertificateExtraction {
  document_info: {
    document_confirmation_number: string;
    management_number: string;
    issue_number: string;
    issue_date: string;
    total_pages: number;
  };
  personal_info: {
    name_korean: string;
    name_hanja: string | null;
    birth_date: string;
    address: string;
  };
  grade: {
    design_construction: {
      job_field: string | null;
      specialty_field: string | null;
    };
    construction_project_management: {
      job_field: string | null;
      specialty_field: string | null;
    };
    quality_management: string | null;
  };
  certifications: Array<{
    type_and_grade: string;
    pass_date: string;
    registration_number: string;
  }>;
  education: Array<{
    graduation_date: string;
    school_name: string;
    department: string;
    degree: string;
  }>;
  work_history: Array<{
    period_start: string;
    period_end: string | null;
    company_name: string;
    company_name_current: string | null;
  }>;
  technical_career: Array<{
    company_name: string;
    project_name: string;
    period_start: string;
    period_end: string;
    recognized_days: number;
    client: string;
    construction_type: string;
    job_field: string;
    specialty_field: string | null;
    task_type: string;
    position: string;
    position_raw: string;
    responsibility_level: string | null;
    project_amount: number | null;
    construction_method: string | null;
    project_overview: string | null;
  }>;
  career_summary: {
    by_construction_type: Array<{ type: string; recognized_days: number }>;
    by_job_specialty: Array<{
      job_field: string;
      specialty_field: string;
      recognized_days: number;
    }>;
    total_recognized_days_by_type: number;
    total_recognized_days_by_field: number;
  };
}

// Step 1 combined extraction result
export interface ExtractionResult {
  resumeData: ResumeExtraction;
  certificateData: CertificateExtraction | null;
}

// Ranking match result
export interface RankingMatch {
  company_name: string;
  year: number;
  rank: number;
  matched_name: string;
}

// Application options
export interface ApplicationOptions {
  applied_field: "건축" | "토목";
  hiring_type: "일반" | "전문직" | "현채직";
}
