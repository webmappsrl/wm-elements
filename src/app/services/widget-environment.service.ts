import {Injectable} from '@angular/core';
import {EnvironmentService} from '@wm-core/services/environment.service';
import {Environment, Shard, ShardName} from '@wm-types/environment';

// EnvironmentService (wm-core) resolves shard/appId from window.location.hostname,
// designed for the webapp's per-subdomain hosting model. On an embeddable widget
// running on a third-party page that logic is wrong — bootstrap-widget already
// reads shard/app-id from <wm-layer-map> attributes and passes them in the
// Environment object. This subclass skips hostname/redirect resolution and
// always uses those values directly (same outcome as the localhost shortcut).
@Injectable()
export class WidgetEnvironmentService extends EnvironmentService {
  private static readonly _oldShardNames = ['geohub', 'geohubdev'];

  override init(environment: Environment): void {
    const appId = environment.appId;
    const shardName = environment.shardName;
    const shard = environment.shards[shardName];
    const awsApi = shard.awsApi;

    const state = this as unknown as {
      _environment: Environment;
      _hostname: string;
      _redirects: Environment['redirects'];
      _redirect: {shardName: ShardName; appId: number} | null;
      _appId: number;
      _shardName: string;
      _shard: Shard;
      _elasticApi: string;
      _graphhopperHost: string;
      _awsApi: string;
      _origin: string;
      _awsPoisUrl: string;
      _confUrl: string;
      _awsIconsUrl: string;
      _awsPbfUrl: string;
      _shareLink: string;
    };

    state._environment = environment;
    state._hostname = window.location.hostname;
    state._redirects = environment.redirects ?? {};
    state._redirect = null;
    state._appId = appId;
    state._shardName = shardName;
    state._shard = shard;
    state._elasticApi = shard.elasticApi;
    state._graphhopperHost = shard.graphhopperHost;
    state._awsApi = awsApi;
    state._origin = shard.origin;

    if (WidgetEnvironmentService._oldShardNames.includes(shardName)) {
      state._awsPoisUrl = `${awsApi}/pois/${appId}.geojson`;
      state._confUrl = `${awsApi}/conf/${appId}.json`;
      state._awsIconsUrl = `${awsApi}/icons/${appId}.json`;
      state._awsPbfUrl = `https://wmpbf.s3.eu-central-1.amazonaws.com/${appId}/{z}/{x}/{y}.pbf`;
    } else {
      state._awsPoisUrl = `${awsApi}/${appId}/pois.geojson`;
      state._confUrl = `${awsApi}/${appId}/config.json`;
      state._awsIconsUrl = `${awsApi}/${appId}/icons.json`;
      state._awsPbfUrl = `${awsApi}/${appId}/pbf/{z}/{x}/{y}.pbf`;
    }

    const subdomain = shardName === 'geohub' ? 'app' : shardName;
    state._shareLink = `${appId}.${subdomain}.webmapp.it`;
    this.init$.next(true);
  }
}
