import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { PlaceWithReviews } from "@shared/schema";
import { Loader2, Check, X, ShieldAlert } from "lucide-react";

interface AdminStats {
  totalPlaces: number;
  approvedPlaces: number;
  pendingPlaces: number;
  approvedToday: number;
}

export default function Admin() {
  const { user, isLoading: authLoading, getIdToken } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [pendingPlaces, setPendingPlaces] = useState<PlaceWithReviews[]>([]);
  const [allPlaces, setAllPlaces] = useState<PlaceWithReviews[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Auth check
  useEffect(() => {
    if (!authLoading && (!user || !user.isAdmin)) {
      setLocation("/");
      toast({
        title: "Access Denied",
        description: "You do not have permission to view the admin panel.",
        variant: "destructive",
      });
    }
  }, [user, authLoading, setLocation, toast]);

  // Fetch data
  const fetchData = async () => {
    if (!user || !user.isAdmin) return;
    
    setIsLoading(true);
    try {
      const token = await getIdToken();
      const headers = { Authorization: `Bearer ${token}` };

      const [statsRes, pendingRes, allRes] = await Promise.all([
        fetch("/api/admin/stats", { headers }),
        fetch("/api/admin/places/pending", { headers }),
        fetch("/api/admin/places", { headers })
      ]);

      if (statsRes.ok) setStats(await statsRes.json());
      if (pendingRes.ok) setPendingPlaces(await pendingRes.json());
      if (allRes.ok) setAllPlaces(await allRes.json());
    } catch (error) {
      console.error("Failed to fetch admin data:", error);
      toast({
        title: "Error",
        description: "Failed to load admin data. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user?.isAdmin) {
      fetchData();
    }
  }, [user]);

  const handleApprove = async (id: string) => {
    setActionLoading(id);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/admin/places/${id}/approve`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
        toast({ title: "Success", description: "Place approved successfully." });
        fetchData(); // Refresh data
      } else {
        throw new Error("Failed to approve");
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to approve place.",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (id: string) => {
    if (!confirm("Are you sure you want to reject and delete this place?")) return;
    
    setActionLoading(id);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/admin/places/${id}/reject`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
        toast({ title: "Success", description: "Place rejected and deleted." });
        fetchData(); // Refresh data
      } else {
        throw new Error("Failed to reject");
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to reject place.",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  if (authLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user?.isAdmin) return null;

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <ShieldAlert className="h-8 w-8 text-primary" />
          Admin Dashboard
        </h1>
        <Button variant="outline" onClick={fetchData}>Refresh Data</Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Places</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalPlaces || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Approved</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats?.approvedPlaces || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{stats?.pendingPlaces || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Approved Today</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.approvedToday || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* data Tabs */}
      <Tabs defaultValue="pending" className="w-full">
        <TabsList>
          <TabsTrigger value="pending">Pending Approval {pendingPlaces.length > 0 && <Badge className="ml-2" variant="secondary">{pendingPlaces.length}</Badge>}</TabsTrigger>
          <TabsTrigger value="all">All Places</TabsTrigger>
        </TabsList>
        
        <TabsContent value="pending" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Pending Places</CardTitle>
            </CardHeader>
            <CardContent>
              {pendingPlaces.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No pending places to review.</div>
              ) : (
                <PlacesTable 
                  places={pendingPlaces} 
                  onApprove={handleApprove} 
                  onReject={handleReject}
                  actionLoading={actionLoading}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="all" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>All Places Database</CardTitle>
            </CardHeader>
            <CardContent>
              <PlacesTable 
                places={allPlaces}
                onApprove={handleApprove}
                onReject={handleReject}
                actionLoading={actionLoading}
                showStatus
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PlacesTable({ 
  places, 
  onApprove, 
  onReject, 
  actionLoading,
  showStatus = false
}: { 
  places: PlaceWithReviews[], 
  onApprove: (id: string) => void, 
  onReject: (id: string) => void,
  actionLoading: string | null,
  showStatus?: boolean
}) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Place Name</TableHead>
            <TableHead>Location</TableHead>
            <TableHead>Submitted On</TableHead>
            {showStatus && <TableHead>Status</TableHead>}
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {places.map((place) => (
            <TableRow key={place.id}>
              <TableCell className="font-medium">
                <div>{place.name}</div>
                <div className="text-xs text-muted-foreground truncate max-w-[200px]">{place.description}</div>
              </TableCell>
              <TableCell>{place.location}</TableCell>
              <TableCell>
                {place.createdAt ? new Date(place.createdAt).toLocaleDateString() : 'N/A'}
              </TableCell>
              {showStatus && (
                <TableCell>
                  {place.approved ? (
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Approved</Badge>
                  ) : (
                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Pending</Badge>
                  )}
                </TableCell>
              )}
              <TableCell className="text-right space-x-2">
                {!place.approved && (
                  <Button 
                    size="sm" 
                    className="bg-green-600 hover:bg-green-700" 
                    onClick={() => onApprove(place.id)}
                    disabled={actionLoading === place.id}
                  >
                    {actionLoading === place.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    <span className="sr-only">Approve</span>
                  </Button>
                )}
                <Button 
                  size="sm" 
                  variant="destructive"
                  onClick={() => onReject(place.id)}
                  disabled={actionLoading === place.id}
                >
                  {actionLoading === place.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                  <span className="sr-only">Reject</span>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
