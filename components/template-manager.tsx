"use client";

import { useState, useEffect } from "react";
import { Plus, Edit2, Trash2, Check, X, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Template,
  getTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} from "@/lib/templates";

interface TemplateManagerProps {
  selectedTemplate: Template | null;
  onSelectTemplate: (template: Template | null) => void;
}

export function TemplateManager({
  selectedTemplate,
  onSelectTemplate,
}: TemplateManagerProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newContent, setNewContent] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    setTemplates(getTemplates());
  }, []);

  const handleCreate = () => {
    if (!newName.trim() || !newContent.trim()) return;

    const template = createTemplate(newName.trim(), newContent.trim());
    setTemplates((prev) => [...prev, template]);
    setIsCreating(false);
    setNewName("");
    setNewContent("");
    onSelectTemplate(template);
  };

  const handleUpdate = (id: string) => {
    if (!newName.trim() || !newContent.trim()) return;

    const updated = updateTemplate(id, {
      name: newName.trim(),
      content: newContent.trim(),
    });
    if (updated) {
      setTemplates((prev) => prev.map((t) => (t.id === id ? updated : t)));
      if (selectedTemplate?.id === id) {
        onSelectTemplate(updated);
      }
    }
    setEditingId(null);
    setNewName("");
    setNewContent("");
  };

  const handleDelete = (id: string) => {
    deleteTemplate(id);
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    if (selectedTemplate?.id === id) {
      onSelectTemplate(null);
    }
    setDeleteId(null);
  };

  const startEdit = (template: Template) => {
    setEditingId(template.id);
    setNewName(template.name);
    setNewContent(template.content);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setIsCreating(false);
    setNewName("");
    setNewContent("");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">
          Message Templates
        </h3>
        {!isCreating && !editingId && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsCreating(true)}
          >
            <Plus className="w-4 h-4 mr-2" />
            New Template
          </Button>
        )}
      </div>

      {/* Create Form */}
      {isCreating && (
        <Card className="p-4 space-y-4 border-primary">
          <Input
            placeholder="Template name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="bg-background"
          />
          <Textarea
            placeholder="Message content..."
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            rows={4}
            className="bg-background resize-none"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={cancelEdit}>
              <X className="w-4 h-4 mr-1" />
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={!newName.trim() || !newContent.trim()}
            >
              <Check className="w-4 h-4 mr-1" />
              Save
            </Button>
          </div>
        </Card>
      )}

      {/* Template List */}
      <ScrollArea className="h-80">
        <div className="space-y-3 pr-4">
          {templates.map((template) =>
            editingId === template.id ? (
              <Card key={template.id} className="p-4 space-y-4 border-primary">
                <Input
                  placeholder="Template name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="bg-background"
                />
                <Textarea
                  placeholder="Message content..."
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  rows={4}
                  className="bg-background resize-none"
                />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={cancelEdit}>
                    <X className="w-4 h-4 mr-1" />
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleUpdate(template.id)}
                    disabled={!newName.trim() || !newContent.trim()}
                  >
                    <Check className="w-4 h-4 mr-1" />
                    Update
                  </Button>
                </div>
              </Card>
            ) : (
              <Card
                key={template.id}
                className={`p-4 cursor-pointer transition-all hover:bg-secondary/50 ${
                  selectedTemplate?.id === template.id
                    ? "border-primary bg-primary/5"
                    : ""
                }`}
                onClick={() => onSelectTemplate(template)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <MessageSquare className="w-4 h-4 text-primary flex-shrink-0" />
                      <h4 className="font-medium truncate">{template.name}</h4>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {template.content}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={(e) => {
                        e.stopPropagation();
                        startEdit(template);
                      }}
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteId(template.id);
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            )
          )}

          {templates.length === 0 && !isCreating && (
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No templates yet</p>
              <p className="text-sm">Create your first message template</p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Selected Template Preview */}
      {selectedTemplate && !editingId && (
        <Card className="p-4 bg-primary/5 border-primary">
          <p className="text-xs font-medium text-primary mb-2">
            Selected Template
          </p>
          <p className="text-sm font-medium mb-1">{selectedTemplate.name}</p>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {selectedTemplate.content}
          </p>
        </Card>
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this template? This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && handleDelete(deleteId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
