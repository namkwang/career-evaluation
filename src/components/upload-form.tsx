"use client";

import { useState, useRef, useCallback, DragEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface UploadFormProps {
  onSubmit: (formData: FormData) => void;
  isLoading: boolean;
}

function FileDropZone({
  file,
  onFileChange,
  label,
  description,
  inputRef,
}: {
  file: File | null;
  onFileChange: (file: File | null) => void;
  label: string;
  description: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrag = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragIn = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.items?.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragOut = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const droppedFile = e.dataTransfer.files?.[0];
      if (droppedFile?.type === "application/pdf") {
        onFileChange(droppedFile);
      }
    },
    [onFileChange]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div
          className={cn(
            "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
            isDragging
              ? "border-primary bg-primary/5"
              : "border-border hover:border-foreground/30"
          )}
          onClick={() => inputRef.current?.click()}
          onDragEnter={handleDragIn}
          onDragLeave={handleDragOut}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
          />
          {file ? (
            <div>
              <p className="font-medium text-sm">{file.name}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {(file.size / 1024 / 1024).toFixed(1)} MB
              </p>
            </div>
          ) : (
            <div>
              <p className="text-muted-foreground text-sm">{description}</p>
              <p className="text-xs text-muted-foreground mt-1">
                클릭 또는 파일을 끌어다 놓으세요
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function UploadForm({ onSubmit, isLoading }: UploadFormProps) {
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [certificateFile, setCertificateFile] = useState<File | null>(null);
  const [appliedField, setAppliedField] = useState<string>("건축");
  const [hiringType, setHiringType] = useState<string>("일반");
  const resumeInputRef = useRef<HTMLInputElement>(null);
  const certInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = () => {
    if (!resumeFile) return;
    const formData = new FormData();
    formData.append("resume", resumeFile);
    if (certificateFile) {
      formData.append("certificate", certificateFile);
    }
    formData.append("applied_field", appliedField);
    formData.append("hiring_type", hiringType);
    onSubmit(formData);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <FileDropZone
          file={resumeFile}
          onFileChange={setResumeFile}
          label="이력서 PDF (필수)"
          description="이력서 PDF를 선택하세요"
          inputRef={resumeInputRef}
        />
        <FileDropZone
          file={certificateFile}
          onFileChange={setCertificateFile}
          label="경력증명서 PDF (선택)"
          description="경력증명서 PDF를 선택하세요"
          inputRef={certInputRef}
        />
      </div>

      {/* 옵션 선택 */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-6">
            <div className="space-y-2">
              <Label>지원 직무</Label>
              <Select value={appliedField} onValueChange={(v) => v && setAppliedField(v)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="건축">건축</SelectItem>
                  <SelectItem value="토목">토목</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>채용 유형</Label>
              <Select value={hiringType} onValueChange={(v) => v && setHiringType(v)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="일반">일반</SelectItem>
                  <SelectItem value="전문직">전문직</SelectItem>
                  <SelectItem value="현채직">현채직</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Button
        onClick={handleSubmit}
        disabled={!resumeFile || isLoading}
        className="w-full"
        size="lg"
      >
        {isLoading ? "분석 중..." : "분석 시작"}
      </Button>
    </div>
  );
}
