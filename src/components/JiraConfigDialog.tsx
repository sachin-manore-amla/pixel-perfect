import { useState, useEffect } from "react";
import { Settings, Eye, EyeOff } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useJiraConfig } from "@/hooks/use-jira-config";
import { ProjectSelector } from "@/components/ProjectSelector";
import { useSelectedProjects } from "@/hooks/useSelectedProjects";

export function JiraConfigDialog() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [testSuccess, setTestSuccess] = useState<boolean | null>(null);
  const { toast } = useToast();
  const { config, saveConfig, clearConfig, testConnection } = useJiraConfig();
  const { selectedProjects } = useSelectedProjects();

  const [formData, setFormData] = useState({
    instanceUrl: "https://amla.atlassian.net",
    email: "",
    apiToken: "",
  });

  useEffect(() => {
    if (config) {
      setFormData({
        instanceUrl: config.instanceUrl,
        email: config.email,
        apiToken: config.apiToken,
      });
    }
  }, [config, open]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSave = async () => {
    if (!formData.instanceUrl || !formData.email || !formData.apiToken) {
      toast({
        title: "Error",
        description: "Please fill in all fields",
        variant: "destructive",
      });
      return;
    }

    // Validate URL format
    try {
      new URL(formData.instanceUrl);
    } catch {
      toast({
        title: "Error",
        description: "Invalid Jira instance URL",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      saveConfig({
        instanceUrl: formData.instanceUrl.replace(/\/$/, ""), // Remove trailing slash
        email: formData.email,
        apiToken: formData.apiToken,
      });

      toast({
        title: "Success",
        description: "Jira configuration saved successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save configuration",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async () => {
    if (!formData.instanceUrl || !formData.email || !formData.apiToken) {
      toast({
        title: "Error",
        description: "Please fill in all fields first",
        variant: "destructive",
      });
      return;
    }

    setTestLoading(true);
    setTestSuccess(null);
    try {
      const success = await testConnection({
        instanceUrl: formData.instanceUrl.replace(/\/$/, ""),
        email: formData.email,
        apiToken: formData.apiToken,
      });

      setTestSuccess(success);
      if (success) {
        toast({
          title: "Success",
          description: "Connected to Jira successfully!",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to connect to Jira. Check your credentials.",
          variant: "destructive",
        });
      }
    } catch (error) {
      setTestSuccess(false);
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Connection test failed",
        variant: "destructive",
      });
    } finally {
      setTestLoading(false);
    }
  };

  const handleClearConfig = () => {
    clearConfig();
    setFormData({
      instanceUrl: "",
      email: "",
      apiToken: "",
    });
    setTestSuccess(null);
    toast({
      title: "Success",
      description: "Jira configuration cleared",
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setStep(1); }}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded"
          title="Jira Configuration"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === 1 ? "Jira Configuration" : "Select Projects to Monitor"}
          </DialogTitle>
          <DialogDescription>
            {step === 1
              ? "Enter your Jira instance details and API credentials to connect to Jira"
              : "Choose which projects you want to track in Attention Tracker"}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-2">
          <div className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${step === 1 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>1</div>
          <span className="text-xs text-muted-foreground">Connection</span>
          <div className="flex-1 h-px bg-border" />
          <div className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${step === 2 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>2</div>
          <span className="text-xs text-muted-foreground">Projects</span>
        </div>

        {step === 2 ? (
          <ProjectSelector onDone={() => { setOpen(false); setStep(1); }} />
        ) : (
          <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
            💡 <strong>Note:</strong> Make sure the backend proxy server is running. Use <code className="bg-blue-100 px-1 py-0.5 rounded">npm run server</code> or <code className="bg-blue-100 px-1 py-0.5 rounded">npm run dev:all</code>
          </div>
          <div className="space-y-2">
            <Label htmlFor="instanceUrl">Jira Instance URL</Label>
            <Input
              id="instanceUrl"
              name="instanceUrl"
              placeholder="https://your-domain.atlassian.net"
              value={formData.instanceUrl}
              onChange={handleInputChange}
              disabled={loading || testLoading}
            />
            <p className="text-xs text-muted-foreground">
              Example: https://mycompany.atlassian.net
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="your-email@company.com"
              value={formData.email}
              onChange={handleInputChange}
              disabled={loading || testLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="apiToken">API Token</Label>
            <div className="relative">
              <Input
                id="apiToken"
                name="apiToken"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your Jira API token"
                value={formData.apiToken}
                onChange={handleInputChange}
                disabled={loading || testLoading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                disabled={loading || testLoading}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Get your API token from{" "}
              <a
                href="https://id.atlassian.com/manage-profile/security/api-tokens"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Atlassian Account Settings
              </a>
            </p>
          </div>

          {testSuccess === true && (
            <Alert className="bg-green-50 border-green-200">
              <AlertDescription className="text-green-800">
                ✓ Successfully connected to Jira
              </AlertDescription>
            </Alert>
          )}

          {testSuccess === false && (
            <Alert className="bg-red-50 border-red-200">
              <AlertDescription className="text-red-800">
                ✗ Connection failed. Please check your credentials.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex gap-2 pt-2">
            <Button
              onClick={handleTestConnection}
              variant="outline"
              disabled={loading || testLoading}
              className="flex-1"
            >
              {testLoading ? "Testing..." : "Test Connection"}
            </Button>
            {testSuccess === true ? (
              <Button
                onClick={() => setStep(2)}
                className="flex-1"
              >
                Next: Select Projects →
              </Button>
            ) : (
              <Button
                onClick={handleSave}
                disabled={loading || testLoading}
                className="flex-1"
              >
                {loading ? "Saving..." : "Save & Connect"}
              </Button>
            )}
          </div>

          {config && (
            <div className="pt-2 border-t">
              <Button
                onClick={handleClearConfig}
                variant="outline"
                disabled={loading || testLoading}
                className="w-full text-destructive hover:text-destructive"
              >
                Disconnect Jira
              </Button>
            </div>
          )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
