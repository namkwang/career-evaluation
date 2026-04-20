"""Unit tests for app.services.extraction — TS parity for validate_combined and field regex."""

from __future__ import annotations

from app.services.extraction import (
    extract_fields_from_stream_text,
    validate_combined,
)


# ---------------------------------------------------------------------------
# validate_combined
# ---------------------------------------------------------------------------


class TestValidateCombined:
    def test_swapped_files_cert_in_resume_slot(self) -> None:
        """When a cert-shaped document is uploaded in the resume slot → error."""
        resume = {
            # Cert-shaped: has document_info but no resume_format_type
            "document_info": {"document_confirmation_number": "ABC-123"},
            "personal_info": {"name_korean": "홍길동"},
        }
        cert = None
        result = validate_combined(resume, cert)
        assert any("이력서 칸에 경력증명서" in e for e in result["errors"])

    def test_swapped_files_resume_in_cert_slot(self) -> None:
        """Resume-shaped document in cert slot → error."""
        resume = {
            "resume_format_type": "general",
            "personal_info": {"name_korean": "홍길동"},
        }
        cert = {
            "resume_format_type": "general",
            # missing document_info.document_confirmation_number
            "personal_info": {"name_korean": "홍길동"},
        }
        result = validate_combined(resume, cert)
        assert any("경력증명서 칸에 이력서" in e for e in result["errors"])

    def test_name_mismatch(self) -> None:
        resume = {
            "resume_format_type": "general",
            "personal_info": {"name_korean": "홍길동"},
        }
        cert = {
            "document_info": {"document_confirmation_number": "X"},
            "personal_info": {"name_korean": "김철수"},
        }
        result = validate_combined(resume, cert)
        assert any(
            "이력서(홍길동)" in e and "경력증명서(김철수)" in e for e in result["errors"]
        )

    def test_phantom_career_removed(self) -> None:
        """Resume career outside cert work_history window is dropped."""
        resume = {
            "resume_format_type": "general",
            "personal_info": {"name_korean": "홍길동"},
            "careers": [
                {
                    "company_name": "(주)알파",
                    "period_start": "2018-01-01",
                    "period_end": "2018-12-31",
                },
                {
                    "company_name": "알파 주식회사",
                    "period_start": "2020-06-01",
                    "period_end": "2020-12-01",
                },
            ],
        }
        cert = {
            "document_info": {"document_confirmation_number": "X"},
            "personal_info": {"name_korean": "홍길동"},
            "work_history": [
                {
                    "company_name": "알파",
                    "period_start": "2020-01-01",
                    "period_end": "2021-01-01",
                }
            ],
            "technical_career": [
                {"company_name": "알파", "period_start": "2020-06-01", "period_end": "2020-12-01"}
            ],
        }
        result = validate_combined(resume, cert)
        cleaned = result["cleaned_resume"]
        names = [(c["period_start"], c["period_end"]) for c in cleaned["careers"]]
        assert ("2018-01-01", "2018-12-31") not in names  # phantom dropped
        assert ("2020-06-01", "2020-12-01") in names  # in-range kept
        # No errors expected for this valid-name case.
        assert result["errors"] == []

    def test_cert_none_pass_through(self) -> None:
        resume = {
            "resume_format_type": "general",
            "personal_info": {"name_korean": "홍길동"},
            "careers": [
                {
                    "company_name": "알파",
                    "period_start": "2020-01-01",
                    "period_end": "2021-01-01",
                }
            ],
            "work_history": [],
        }
        result = validate_combined(resume, None)
        assert result["errors"] == []
        # Careers preserved untouched
        assert len(result["cleaned_resume"]["careers"]) == 1

    def test_all_valid_no_warnings(self) -> None:
        resume = {
            "resume_format_type": "general",
            "personal_info": {"name_korean": "홍길동"},
            "careers": [
                {
                    "company_name": "알파",
                    "period_start": "2020-06-01",
                    "period_end": "2020-12-01",
                }
            ],
            "work_history": [
                {
                    "company_name": "알파",
                    "period_start": "2020-01-01",
                    "period_end": "2021-01-01",
                }
            ],
        }
        cert = {
            "document_info": {"document_confirmation_number": "X"},
            "personal_info": {"name_korean": "홍길동"},
            "work_history": [
                {
                    "company_name": "알파",
                    "period_start": "2020-01-01",
                    "period_end": "2021-01-01",
                }
            ],
            "technical_career": [
                {"company_name": "알파", "period_start": "2020-06-01", "period_end": "2020-12-01"}
            ],
        }
        result = validate_combined(resume, cert)
        assert result["errors"] == []
        assert result["warnings"] == []

    def test_missing_resume_name(self) -> None:
        resume = {"resume_format_type": "general", "personal_info": {}}
        result = validate_combined(resume, None)
        assert any("이력서에서 지원자 이름" in e for e in result["errors"])

    def test_empty_careers_and_work_history_warns(self) -> None:
        resume = {
            "resume_format_type": "general",
            "personal_info": {"name_korean": "홍길동"},
            "careers": [],
            "work_history": [],
        }
        result = validate_combined(resume, None)
        assert any("경력 정보를 추출하지 못했습니다" in w for w in result["warnings"])


# ---------------------------------------------------------------------------
# extract_fields_from_stream_text
# ---------------------------------------------------------------------------


class TestExtractFields:
    def test_name_only(self) -> None:
        text = 'partial... "name_korean": "홍길동" more'
        assert "이름: 홍길동" in extract_fields_from_stream_text(text)

    def test_multiple_companies_dedup(self) -> None:
        text = (
            '{"company_name": "알파"},'
            '{"company_name": "베타"},'
            '{"company_name": "알파"}'  # duplicate
        )
        fields = extract_fields_from_stream_text(text)
        company_fields = [f for f in fields if f.startswith("회사: ")]
        assert company_fields == ["회사: 알파", "회사: 베타"]

    def test_projects_and_schools_and_certs(self) -> None:
        text = (
            '"name_korean": "김철수"'
            '"project_name": "서울시청"'
            '"school_name": "서울대"'
            '"type_and_grade": "정보처리기사"'
        )
        fields = extract_fields_from_stream_text(text)
        assert "이름: 김철수" in fields
        assert "현장: 서울시청" in fields
        assert "학교: 서울대" in fields
        assert "자격증: 정보처리기사" in fields

    def test_empty_text_returns_empty_list(self) -> None:
        assert extract_fields_from_stream_text("") == []

    def test_partial_no_match(self) -> None:
        # Cut off mid-value — should not match
        assert extract_fields_from_stream_text('"name_korean": "홍길') == []
