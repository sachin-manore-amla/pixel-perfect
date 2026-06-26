import { DashboardLayout } from "@/components/DashboardLayout";
import { JiraConfigDialog } from "@/components/JiraConfigDialog";
import { JiraApiExample } from "@/components/JiraApiExample";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const Settings = () => {
  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your configurations and integrations
          </p>
        </div>

        {/* Jira Configuration Section */}
        <Card>
          <CardHeader>
            <CardTitle>Jira Integration</CardTitle>
            <CardDescription>
              Configure your Jira instance to access and manage issues
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-4">
              <h3 className="font-medium text-sm mb-2">Configuration Status</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Click the button below to set up or update your Jira connection.
              </p>
              <JiraConfigDialog />
            </div>

            <Separator />

            <div>
              <h3 className="font-medium text-sm mb-2">How to get your API Token</h3>
              <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                <li>
                  Go to{" "}
                  <a
                    href="https://id.atlassian.com/manage-profile/security/api-tokens"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    Atlassian Account Settings
                  </a>
                </li>
                <li>Click "Create API token"</li>
                <li>Copy the generated token</li>
                <li>Paste it in the configuration dialog above</li>
              </ol>
            </div>
          </CardContent>
        </Card>

        {/* Jira API Example Section */}
        <Card>
          <CardHeader>
            <CardTitle>Jira API Example</CardTitle>
            <CardDescription>
              Test your Jira connection and view API integration examples
            </CardDescription>
          </CardHeader>
          <CardContent>
            <JiraApiExample />
          </CardContent>
        </Card>

        {/* Integration Documentation */}
        <Card>
          <CardHeader>
            <CardTitle>Integration Guide</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <div>
              <h3 className="font-medium text-foreground mb-1">Using the Jira API Hook</h3>
              <p>
                Import <code className="bg-muted px-2 py-1 rounded">useJiraAPI</code> hook in your components:
              </p>
              <pre className="bg-muted p-3 rounded-lg mt-2 overflow-x-auto text-xs">
{`import { useJiraAPI } from "@/hooks/use-jira-config";

export function MyComponent() {
  const { get, post, isConfigured } = useJiraAPI();
  
  // Fetch issues
  const issues = await get("/search?jql=...");
  
  // Create issue
  const newIssue = await post("/issue", {...});
}`}
              </pre>
            </div>

            <div>
              <h3 className="font-medium text-foreground mb-1">Available Methods</h3>
              <ul className="space-y-1 list-disc list-inside">
                <li><code className="bg-muted px-2 py-1 rounded">get(endpoint)</code> - GET request</li>
                <li><code className="bg-muted px-2 py-1 rounded">post(endpoint, body)</code> - POST request</li>
                <li><code className="bg-muted px-2 py-1 rounded">put(endpoint, body)</code> - PUT request</li>
                <li><code className="bg-muted px-2 py-1 rounded">patch(endpoint, body)</code> - PATCH request</li>
                <li><code className="bg-muted px-2 py-1 rounded">delete(endpoint)</code> - DELETE request</li>
              </ul>
            </div>

            <div>
              <h3 className="font-medium text-foreground mb-1">Jira API Documentation</h3>
              <p>
                For complete API documentation, visit{" "}
                <a
                  href="https://developer.atlassian.com/cloud/jira/rest/v3"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Atlassian Jira Cloud REST API
                </a>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Settings;
