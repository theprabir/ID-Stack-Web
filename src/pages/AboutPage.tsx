import { Github, User, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Button } from '@/components/ui';
import { APP_VERSION } from '@/constants/app';
import { APP_AUTHOR_NAME, APP_AUTHOR_GITHUB, APP_REPO_URL } from '@/constants/app';

/**
 * About page: app info, author credit, repository link, privacy and license.
 */
export function AboutPage(): JSX.Element {
  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">About</h1>
      <Card>
        <CardHeader>
          <CardTitle>ID Stack</CardTitle>
          <CardDescription>Version {APP_VERSION}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
          <p>
            A professional, open-source ID card design and batch printing software that runs
            entirely in your browser.
          </p>
          <p>100% client-side — your data never leaves your device.</p>
          <p>Released under the MIT License.</p>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Credits</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-primary" aria-hidden="true" />
            <span className="text-foreground">{APP_AUTHOR_NAME}</span>
            <a
              href={APP_AUTHOR_GITHUB}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              @theprabir
            </a>
          </div>
          <div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(APP_REPO_URL, '_blank', 'noopener')}
            >
              <Github className="h-4 w-4" aria-hidden="true" />
              View on GitHub
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
