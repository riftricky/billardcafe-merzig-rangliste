#!/usr/bin/perl
# Lokaler Demo-Server für den Mac (Perl ist auf jedem Mac vorinstalliert – nichts zu installieren).
# Start: Doppelklick auf "Demo starten (Mac).command" im Projektordner.
# Gleiche Funktion wie tools/demo-server.ps1 (Windows) und tools/demo_server.py:
# liefert den Projektordner aus und koppelt Demo-App und Café-Bildschirm (/demo-relay/tv/<id>).
use strict;
use warnings;
use IO::Socket::INET;
use File::Temp qw(tempdir);
use File::Spec;
use Cwd qw(abs_path);
use POSIX ();

my $port = $ENV{DEMO_PORT} || 8765;
my $root = abs_path(File::Spec->catdir((File::Spec->splitpath(abs_path($0)))[1], '..'));
my $relay = tempdir('billard-demo-XXXX', TMPDIR => 1, CLEANUP => 1);   # geteilt zwischen den Verbindungen
my %mime = (html => 'text/html; charset=utf-8', js => 'text/javascript; charset=utf-8', css => 'text/css; charset=utf-8',
  json => 'application/json; charset=utf-8', svg => 'image/svg+xml', png => 'image/png', jpg => 'image/jpeg', jpeg => 'image/jpeg',
  webp => 'image/webp', ico => 'image/x-icon', webmanifest => 'application/manifest+json', mp4 => 'video/mp4', webm => 'video/webm',
  woff => 'font/woff', woff2 => 'font/woff2', txt => 'text/plain; charset=utf-8', md => 'text/plain; charset=utf-8', pdf => 'application/pdf');

my $server = IO::Socket::INET->new(LocalAddr => '0.0.0.0', LocalPort => $port, Proto => 'tcp', Listen => 32, ReuseAddr => 1)
  or die "\n  Port $port ist schon belegt. Läuft die Demo bereits in einem anderen Fenster?\n  Sonst mit anderem Port starten:  DEMO_PORT=8790 perl tools/demo-server.pl\n\n";
$SIG{CHLD} = 'IGNORE';
$| = 1;
print "SERVER-BEREIT $port\n";

sub respond {
  my ($c, $status, $type, $body) = @_;
  my %reason = (200 => 'OK', 204 => 'No Content', 403 => 'Forbidden', 404 => 'Not Found', 405 => 'Method Not Allowed', 413 => 'Payload Too Large');
  print $c "HTTP/1.1 $status $reason{$status}\r\nContent-Type: $type\r\nContent-Length: " . length($body) . "\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n" . $body;
}

sub handle {
  my ($c) = @_;
  binmode $c;
  local $/ = "\r\n";
  my $line = <$c> // return;
  my ($method, $target) = $line =~ m{^(\S+)\s+(\S+)} or return;
  my $len = 0;
  while (my $h = <$c>) { last if $h eq "\r\n"; $len = $1 if $h =~ /^Content-Length:\s*(\d+)/i; }
  my $path = (split /\?/, $target)[0];
  $path =~ s/%([0-9A-Fa-f]{2})/chr(hex($1))/ge;

  if ($path =~ m{^/demo-relay/tv/([A-Za-z0-9_-]+)$}) {
    my $file = "$relay/$1.json";
    if ($method eq 'POST') {
      return respond($c, 413, 'text/plain', '') if $len > 30 * 1024 * 1024;
      my $body = ''; while (length($body) < $len) { my $n = read($c, my $buf, $len - length($body)); last unless $n; $body .= $buf; }
      open(my $fh, '>:raw', "$file.tmp") or return respond($c, 403, 'text/plain', '');
      print $fh $body; close $fh; rename("$file.tmp", $file);
      return respond($c, 204, 'text/plain', '');
    }
    if (open(my $fh, '<:raw', $file)) { local $/; my $d = <$fh>; close $fh; return respond($c, 200, 'application/json; charset=utf-8', $d); }
    return respond($c, 404, 'text/plain; charset=utf-8', 'Noch keine Demo-App geöffnet');
  }
  return respond($c, 405, 'text/plain', '') unless $method eq 'GET' || $method eq 'HEAD';
  $path = '/demo.html' if $path eq '/';
  return respond($c, 403, 'text/plain', '') if $path =~ /\.\./ || $path =~ m{/\.};
  my $file = File::Spec->catfile($root, split m{/}, $path);
  return respond($c, 404, 'text/plain; charset=utf-8', "Nicht gefunden: $path") unless -f $file;
  my ($ext) = $file =~ /\.([A-Za-z0-9]+)$/;
  open(my $fh, '<:raw', $file) or return respond($c, 403, 'text/plain', '');
  local $/; my $data = <$fh>; close $fh;
  respond($c, 200, $mime{lc($ext // '')} // 'application/octet-stream', $method eq 'HEAD' ? '' : $data);
}

while (1) {
  my $c = $server->accept or next;
  my $pid = fork();
  if (!defined $pid) { handle($c); close $c; next; }
  if ($pid == 0) { $server->close; eval { local $SIG{ALRM} = sub { die "timeout\n" }; alarm 30; handle($c); alarm 0; }; close $c; POSIX::_exit(0); }
  close $c;
}
