-- career_evaluation.admins: 서비스 전용 관리자 테이블
-- 공유 auth 스키마를 수정하지 않고, 이 서비스에 한정된 admin 권한 관리

CREATE TABLE IF NOT EXISTS career_evaluation.admins (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(user_id)
);

-- RLS 활성화
ALTER TABLE career_evaluation.admins ENABLE ROW LEVEL SECURITY;

-- service_role만 접근 가능 (anon/authenticated 직접 접근 차단)
CREATE POLICY "Service role full access"
  ON career_evaluation.admins
  FOR ALL
  USING (true)
  WITH CHECK (true);
