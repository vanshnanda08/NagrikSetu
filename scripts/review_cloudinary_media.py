#!/usr/bin/env python3
"""Read-only Cloudinary inventory review against current database references.

No deletion endpoint or write transaction is used. Credentials stay in a private
local env file; the output contains asset IDs and aggregate counts, never keys.
Requires psycopg 3 in a private tool environment.
"""
import argparse
import base64
import datetime
import json
import shlex
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
import psycopg

ROOT = Path(__file__).resolve().parents[1]


def values(path):
    result = {}
    for line in path.read_text().splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            key, value = line.split('=', 1)
            parts = shlex.split(value)
            result[key.removeprefix('export ').strip()] = parts[0] if parts else ''
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--credentials', type=Path, default=ROOT / 'backups/media-review.env')
    parser.add_argument('--database-env', type=Path, default=ROOT / 'backend/.env.seed')
    parser.add_argument('--prefix', default='nagriksetu_thapar_demo_v2_')
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if len(args.prefix) < 6:
        raise RuntimeError('An explicit application-owned public-ID prefix is required')
    args.credentials.chmod(0o600)
    media, db = values(args.credentials), values(args.database_env)
    for key in ('CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'):
        if not media.get(key) or media[key].startswith('REPLACE_'):
            raise RuntimeError('Fill the private media credential file before review; no key is printed')
    cloud = media['CLOUDINARY_CLOUD_NAME']
    catalogue = json.loads((ROOT / 'scripts/data/thapar-demo-v2-assets.json').read_text())
    if cloud != catalogue['cloud']:
        raise RuntimeError('Media cloud does not match the approved application catalogue')
    url = urllib.parse.urlsplit(db['DATABASE_URL'].removeprefix('jdbc:'))
    with psycopg.connect(host=url.hostname, port=url.port or 5432,
                         dbname=url.path.lstrip('/'), user=db['DATABASE_USER'],
                         password=db['DATABASE_PASSWORD'], sslmode='require', connect_timeout=25) as c:
        c.execute('SET TRANSACTION READ ONLY')
        references = [r[0] for r in c.execute('SELECT photo_url FROM reports UNION SELECT resolution_photo_url FROM issues WHERE resolution_photo_url IS NOT NULL')]
    authorization = 'Basic ' + base64.b64encode((media['CLOUDINARY_API_KEY'] + ':' + media['CLOUDINARY_API_SECRET']).encode()).decode()
    assets, cursor = [], None
    while True:
        query = {'max_results': 500, 'prefix': args.prefix}
        if cursor:
            query['next_cursor'] = cursor
        endpoint = 'https://api.cloudinary.com/v1_1/' + urllib.parse.quote(cloud, safe='') + '/resources/image/upload?' + urllib.parse.urlencode(query)
        request = urllib.request.Request(endpoint, headers={'Authorization': authorization}, method='GET')
        try:
            with urllib.request.urlopen(request, timeout=40) as response:
                page = json.load(response)
        except urllib.error.HTTPError as error:
            raise RuntimeError('Cloudinary read-only inventory refused: HTTP ' + str(error.code)) from None
        assets.extend(page.get('resources', []))
        cursor = page.get('next_cursor')
        if not cursor:
            break
    now = datetime.datetime.now(datetime.timezone.utc)
    cutoff = now - datetime.timedelta(hours=24)
    known = {a['publicId'] for a in catalogue['assets'].values()}
    protected, candidates, young = [], [], []
    for asset in assets:
        public_id = asset['public_id']
        if not public_id.startswith(args.prefix):
            raise RuntimeError('Media API returned an asset outside the reviewed scope')
        if any(public_id in reference for reference in references):
            protected.append(public_id)
        elif datetime.datetime.fromisoformat(asset['created_at'].replace('Z', '+00:00')) >= cutoff:
            young.append(public_id)
        else:
            candidates.append(public_id)
    missing = sorted(known - {a['public_id'] for a in assets}) if args.prefix == 'nagriksetu_thapar_demo_v2_' else []
    result = {'checkedAt': now.isoformat(), 'mode': 'READ ONLY / NO DELETION',
              'prefix': args.prefix, 'scanned': len(assets), 'protected': len(protected),
              'tooYoung': len(young), 'reviewCandidates': len(candidates),
              'candidateIds': candidates, 'catalogueAssetsMissing': missing,
              'deleted': 0, 'policy': 'Leave unscoped legacy uploads and all other applications outside automatic cleanup. Keep destructive cleanup disabled.'}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2))
    if missing or known.intersection(candidates):
        raise RuntimeError('Catalogue protection check failed; review output, no media was changed')
    print(json.dumps({k: v for k, v in result.items() if k != 'candidateIds'}, indent=2))


if __name__ == '__main__':
    main()
