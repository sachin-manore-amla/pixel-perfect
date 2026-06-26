import { useState } from "react";
import { useJiraAPI } from "@/hooks/use-jira-config";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2 } from "lucide-react";

interface JiraUser {
  self: string;
  accountId: string;
  accountType: string;
  name: string;
  key: string;
  avatarUrls: Record<string, string>;
  displayName: string;
  active: boolean;
  timeZone: string;
  locale: string;
  groups: Record<string, unknown>;
  applicationRoles: Record<string, unknown>;
  expand: string;
}

interface JiraIssue {
  key: string;
  id: string;
  fields: {
    summary: string;
    status: {
      name: string;
    };
    priority: {
      name: string;
    };
    assignee: JiraUser | null;
  };
}

export function JiraApiExample() {
  const { get, isConfigured } = useJiraAPI();
  const [userData, setUserData] = useState<JiraUser | null>(null);
  const [issues, setIssues] = useState<JiraIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUserData = async () => {
    if (!isConfigured) {
      setError("Jira not configured. Please configure Jira first.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await get<JiraUser>("/myself");
      setUserData(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch user data"
      );
    } finally {
      setLoading(false);
    }
  };

  const fetchIssues = async () => {
    if (!isConfigured) {
      setError("Jira not configured. Please configure Jira first.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await get<{ issues: JiraIssue[] }>(
        "/search?jql=assignee=currentUser()&maxResults=10"
      );
      setIssues(data.issues);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch issues"
      );
    } finally {
      setLoading(false);
    }
  };

  if (!isConfigured) {
    return (
      <Alert className="bg-yellow-50 border-yellow-200">
        <AlertDescription className="text-yellow-800">
          Jira is not configured. Please go to the settings icon in the sidebar and configure your Jira instance. Make sure the backend proxy server is running first!
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        <Button onClick={fetchUserData} disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Fetch User Data
        </Button>
        <Button onClick={fetchIssues} disabled={loading} variant="outline">
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Fetch My Issues
        </Button>
      </div>

      {error && (
        <Alert className="bg-red-50 border-red-200">
          <AlertDescription className="text-red-800">{error}</AlertDescription>
        </Alert>
      )}

      {userData && (
        <Card>
          <CardHeader>
            <CardTitle>User Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p>
              <strong>Name:</strong> {userData.displayName}
            </p>
            <p>
              <strong>Account ID:</strong> {userData.accountId}
            </p>
            <p>
              <strong>Time Zone:</strong> {userData.timeZone}
            </p>
            <p>
              <strong>Locale:</strong> {userData.locale}
            </p>
          </CardContent>
        </Card>
      )}

      {issues.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Your Issues</CardTitle>
            <CardDescription>{issues.length} issues found</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {issues.map((issue) => (
                <div key={issue.key} className="border rounded-lg p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="font-medium text-sm">{issue.key}</p>
                      <p className="text-sm text-muted-foreground">
                        {issue.fields.summary}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                        {issue.fields.status.name}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
