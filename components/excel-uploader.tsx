"use client";

import { useState, useCallback } from "react";
import { Upload, FileSpreadsheet, X, AlertCircle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { parseExcelFile, Contact, ParseResult } from "@/lib/excel-parser";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ExcelUploaderProps {
  onContactsLoaded: (contacts: Contact[]) => void;
  contacts: Contact[];
}

export function ExcelUploader({ onContactsLoaded, contacts }: ExcelUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [selectedColumn, setSelectedColumn] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
        setError("Please upload a valid Excel file (.xlsx, .xls, or .csv)");
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const result = await parseExcelFile(file, selectedColumn || undefined);
        setFileName(file.name);
        setParseResult(result);
        onContactsLoaded(result.contacts);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to parse Excel file"
        );
      } finally {
        setIsLoading(false);
      }
    },
    [selectedColumn, onContactsLoaded]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile]
  );

  const clearFile = () => {
    setFileName(null);
    setParseResult(null);
    onContactsLoaded([]);
    setError(null);
  };

  const handleColumnChange = async (column: string) => {
    setSelectedColumn(column);
    // Re-parse if we have a file - for now user needs to re-upload
  };

  return (
    <div className="space-y-6">
      {/* Upload Area */}
      {!fileName ? (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`
            relative border-2 border-dashed rounded-xl p-12 text-center transition-all cursor-pointer
            ${
              isDragging
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50 hover:bg-secondary/30"
            }
          `}
        >
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileInput}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            disabled={isLoading}
          />
          <div className="flex flex-col items-center gap-4">
            <div className="p-4 rounded-full bg-secondary">
              <Upload className="w-8 h-8 text-muted-foreground" />
            </div>
            <div>
              <p className="text-lg font-medium">
                {isLoading ? "Processing..." : "Drop your Excel file here"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                or click to browse (.xlsx, .xls, .csv)
              </p>
            </div>
          </div>
        </div>
      ) : (
        <Card className="p-4 bg-secondary/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <FileSpreadsheet className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">{fileName}</p>
                <p className="text-sm text-muted-foreground">
                  {parseResult?.validCount} valid contacts
                  {parseResult?.invalidCount
                    ? ` (${parseResult.invalidCount} invalid)`
                    : ""}
                </p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={clearFile}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </Card>
      )}

      {/* Error Message */}
      {error && (
        <div className="flex items-center gap-2 p-4 rounded-lg bg-destructive/10 text-destructive">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Column Selector */}
      {parseResult && parseResult.columns.length > 1 && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">
            Phone Number Column
          </label>
          <Select value={selectedColumn} onValueChange={handleColumnChange}>
            <SelectTrigger>
              <SelectValue placeholder="Auto-detected" />
            </SelectTrigger>
            <SelectContent>
              {parseResult.columns.map((col) => (
                <SelectItem key={col} value={col}>
                  {col}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Contact Preview */}
      {contacts.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-muted-foreground">
              Contact Preview
            </h3>
            <span className="text-xs text-muted-foreground">
              Showing {Math.min(10, contacts.length)} of {contacts.length}
            </span>
          </div>
          <ScrollArea className="h-48 rounded-lg border bg-secondary/30">
            <div className="p-3 space-y-2">
              {contacts.slice(0, 10).map((contact, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-2 rounded-lg bg-background/50"
                >
                  <span className="font-mono text-sm">{contact.phone}</span>
                  {contact.isValid ? (
                    <CheckCircle className="w-4 h-4 text-primary" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-destructive" />
                  )}
                </div>
              ))}
              {contacts.length > 10 && (
                <p className="text-center text-sm text-muted-foreground py-2">
                  ... and {contacts.length - 10} more contacts
                </p>
              )}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
