import { Card as UICard, CardContent } from "@/components/ui/card";

const colors = {
  blue: "bg-blue-50 text-blue-600",
  green: "bg-green-50 text-green-600",
  purple: "bg-purple-50 text-purple-600",
  orange: "bg-orange-50 text-orange-600",
};

interface CardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  color: keyof typeof colors;
}

const Card = ({ title, value, icon, color }: CardProps) => {
  return (
    <UICard className="py-0">
      <CardContent className="flex items-center gap-4 p-5">
      <div className={`rounded-lg p-3 ${colors[color]}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <p className="text-2xl font-bold text-card-foreground">{value}</p>
      </div>
      </CardContent>
    </UICard>
  );
};

export default Card;
