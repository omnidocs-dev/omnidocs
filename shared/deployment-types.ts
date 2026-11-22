type DeploymentShape = 'rack'|'cube'|'storage'|'network'|'policy';
const cluster='Kubernetes · Cluster';
const workload='Kubernetes · Workloads';
const network='Kubernetes · Networking';
const storage='Kubernetes · Storage';
const policy='Kubernetes · Configuration & access';
const infrastructure='Infrastructure · Compute & network';
const services='Infrastructure · Data & operations';

function deploymentType<const Id extends string>(id:Id,label:string,group:string,shape:DeploymentShape,hint:string){
 return {id,label,group,shape,hint,kind:'deployment',levels:['deployment']} as const;
}

export const deploymentTypes=[
 deploymentType('k8s-cluster','Kubernetes cluster',cluster,'cube','A control plane and the nodes it manages.'),
 deploymentType('k8s-namespace','Namespace',cluster,'cube','A scope for namespaced resources.'),
 deploymentType('k8s-control-plane','Control plane',cluster,'rack','The components that manage cluster state.'),
 deploymentType('k8s-node','Worker node',cluster,'rack','A machine that runs Pods.'),
 deploymentType('k8s-apiserver','kube-apiserver',cluster,'network','Exposes the Kubernetes API.'),
 deploymentType('k8s-etcd','etcd',cluster,'storage','Stores Kubernetes API state.'),
 deploymentType('k8s-scheduler','kube-scheduler',cluster,'policy','Assigns unscheduled Pods to nodes.'),
 deploymentType('k8s-controller','kube-controller-manager',cluster,'policy','Runs the core reconciliation controllers.'),
 deploymentType('k8s-cloud-controller','cloud-controller-manager',cluster,'policy','Integrates with a cloud provider.'),
 deploymentType('k8s-kubelet','kubelet',cluster,'rack','Manages Pods on a node.'),
 deploymentType('k8s-proxy','kube-proxy',cluster,'network','Provides node-level Service forwarding rules.'),
 deploymentType('k8s-runtime','Container runtime',cluster,'rack','Runs containers on a node, such as containerd or CRI-O.'),
 deploymentType('k8s-operator','Operator / Custom resource',cluster,'policy','Models an extension or an operator-managed resource.'),
 deploymentType('k8s-crd','CustomResourceDefinition (CRD)',cluster,'policy','Defines a custom Kubernetes API resource type.'),
 deploymentType('k8s-deployment','Deployment',workload,'cube','Manages stateless replicas and rolling updates.'),
 deploymentType('k8s-pod','Pod',workload,'cube','The unit Kubernetes schedules onto a node.'),
 deploymentType('k8s-container','Container / Sidecar',workload,'cube','A container running inside a Pod.'),
 deploymentType('k8s-statefulset','StatefulSet',workload,'cube','Manages Pods with stable identity or storage.'),
 deploymentType('k8s-daemonset','DaemonSet',workload,'cube','Runs a Pod on each eligible node.'),
 deploymentType('k8s-replicaset','ReplicaSet',workload,'cube','Keeps a specified number of Pod replicas.'),
 deploymentType('k8s-job','Job',workload,'cube','Runs a task to completion.'),
 deploymentType('k8s-cronjob','CronJob',workload,'cube','Runs Jobs on a schedule.'),
 deploymentType('k8s-hpa','HorizontalPodAutoscaler (HPA)',workload,'policy','Changes workload replica count using metrics.'),
 deploymentType('k8s-pdb','PodDisruptionBudget (PDB)',workload,'policy','Limits simultaneous voluntary Pod disruptions.'),
 deploymentType('k8s-service','Service',network,'network','Offers a stable endpoint for a workload.'),
 deploymentType('k8s-endpointslice','EndpointSlice',network,'network','Groups the endpoints behind a Service.'),
 deploymentType('k8s-ingress','Ingress',network,'network','Routes external HTTP traffic to Services.'),
 deploymentType('k8s-gateway','Gateway',network,'network','Defines traffic listeners for Gateway API routes.'),
 deploymentType('k8s-gatewayclass','GatewayClass',network,'network','Identifies the controller and settings for a Gateway.'),
 deploymentType('k8s-httproute','HTTPRoute',network,'network','Defines HTTP routing rules for a Gateway.'),
 deploymentType('k8s-networkpolicy','NetworkPolicy',network,'policy','Specifies permitted traffic for selected Pods.'),
 deploymentType('k8s-dns','CoreDNS / Cluster DNS',network,'network','Resolves service and cluster names.'),
 deploymentType('k8s-cni','CNI plugin',network,'network','Provides Pod networking.'),
 deploymentType('k8s-pv','PersistentVolume (PV)',storage,'storage','Storage provisioned for use in a cluster.'),
 deploymentType('k8s-pvc','PersistentVolumeClaim (PVC)',storage,'storage','Requests persistent storage for a workload.'),
 deploymentType('k8s-storageclass','StorageClass',storage,'storage','Defines how to provision storage.'),
 deploymentType('k8s-csi','CSI driver',storage,'storage','Integrates Kubernetes with a storage provider.'),
 deploymentType('k8s-configmap','ConfigMap',policy,'policy','Stores non-secret workload configuration.'),
 deploymentType('k8s-secret','Secret',policy,'policy','Represents a Kubernetes Secret resource.'),
 deploymentType('k8s-serviceaccount','ServiceAccount',policy,'policy','An identity used by workloads.'),
 deploymentType('k8s-role','Role / ClusterRole',policy,'policy','Defines Kubernetes API permissions.'),
 deploymentType('k8s-rolebinding','RoleBinding / ClusterRoleBinding',policy,'policy','Grants a Role or ClusterRole to identities.'),
 deploymentType('k8s-quota','ResourceQuota / LimitRange',policy,'policy','Documents resource constraints for a namespace.'),
 deploymentType('k8s-admission','Admission controller / Webhook',policy,'policy','Validates or mutates API requests during admission.'),
 deploymentType('infra-server','Physical server',infrastructure,'rack','A bare-metal host.'),
 deploymentType('infra-vm','Virtual machine (VM)',infrastructure,'rack','A virtualized compute instance.'),
 deploymentType('infra-network','Virtual network (VPC)',infrastructure,'network','A network boundary for infrastructure.'),
 deploymentType('infra-subnet','Subnet',infrastructure,'network','An address range within a network.'),
 deploymentType('infra-load-balancer','Load balancer',infrastructure,'network','Distributes traffic across targets.'),
 deploymentType('infra-firewall','Firewall / Security group',infrastructure,'policy','Defines allowed network traffic.'),
 deploymentType('infra-dns','DNS',infrastructure,'network','Resolves addresses and service names.'),
 deploymentType('infra-proxy','Reverse proxy / CDN',infrastructure,'network','Routes or caches traffic at the edge.'),
 deploymentType('infra-database','Database',services,'storage','A deployed database instance or cluster.'),
 deploymentType('infra-cache','Cache',services,'storage','A deployed cache instance or cluster.'),
 deploymentType('infra-queue','Queue / Message broker',services,'cube','A messaging service or broker cluster.'),
 deploymentType('infra-object-storage','Object storage',services,'storage','A deployed bucket or object store.'),
 deploymentType('infra-block-storage','Block storage',services,'storage','A disk or block storage volume.'),
 deploymentType('infra-registry','Container registry',services,'storage','Stores container images.'),
 deploymentType('infra-observability','Monitoring / Logging',services,'policy','Collects metrics, traces or logs.'),
 deploymentType('infra-backup','Backup service',services,'storage','Stores or coordinates backups.'),
 deploymentType('deployment','Custom infrastructure',services,'cube','A deployment item outside the predefined categories.'),
] as const;

export type DeploymentType = (typeof deploymentTypes)[number]['id'];

export function inferDeploymentType(name:string,technology:string):DeploymentType {
 const description=`${technology} ${name}`;
 const patterns:[RegExp,DeploymentType][]=[
  [/\b(backup|backups)\b/i,'infra-backup'],[/\b(configmap|secret)\b/i,'k8s-configmap'],
  [/\b(load balancer|alb|nlb)\b/i,'infra-load-balancer'],[/\bingress\b/i,'k8s-ingress'],
  [/\b(ClusterIP|NodePort)\b|^Service\b/i,'k8s-service'],[/\b(namespace)\b/i,'k8s-namespace'],
  [/\b(control plane|scheduler)\b/i,'k8s-control-plane'],[/\b(kubelet|node pool|worker pool)\b/i,'k8s-node'],
  [/\bstatefulset\b/i,'k8s-statefulset'],[/\bdeployment\b/i,'k8s-deployment'],[/\bPod(s)?\b/i,'k8s-pod'],
  [/\b(PVC|persistent volume)\b/i,'k8s-pvc'],[/\b(etcd)\b/i,'k8s-etcd'],
  [/\b(postgres(?:ql)?|mysql|mariadb|mongodb|database)\b/i,'infra-database'],[/\b(redis|valkey)\b/i,'infra-cache'],
  [/\b(S3|object storage)\b/i,'infra-object-storage'],[/\b(prometheus|grafana|telemetry|loki)\b/i,'infra-observability'],
  [/\b(kubernetes|k8s)\b/i,'k8s-cluster'],[/\b(VM|virtual machine)\b/i,'infra-vm'],
  [/\b(bare.metal|server|host)\b/i,'infra-server'],
 ];
 return patterns.find(([pattern])=>pattern.test(description))?.[1]??'deployment';
}
